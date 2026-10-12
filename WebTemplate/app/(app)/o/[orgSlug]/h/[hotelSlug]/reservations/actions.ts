"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { OCCUPYING_STATUSES, generateConfirmationCode, nightsBetween } from "@/lib/pms";
import { emitWebhookEvent } from "@/lib/webhooks";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

// Count active, in-service rooms of a type minus the reservations of that type
// that occupy inventory over [checkIn, checkOut). > 0 means bookable.
async function roomTypeAvailability(
  supabase: SupabaseServer,
  hotelId: string,
  roomTypeId: string,
  checkIn: string,
  checkOut: string,
  excludeReservationId?: string,
): Promise<number> {
  const { count: roomCount } = await supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("room_type_id", roomTypeId)
    .eq("status", "active")
    .neq("housekeeping_status", "out_of_service");

  let overlap = supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId)
    .eq("room_type_id", roomTypeId)
    .in("status", OCCUPYING_STATUSES)
    .lt("check_in_date", checkOut)
    .gt("check_out_date", checkIn);
  if (excludeReservationId) overlap = overlap.neq("id", excludeReservationId);
  const { count: occupied } = await overlap;

  return (roomCount ?? 0) - (occupied ?? 0);
}

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  guestId: z.string().min(1, "Choose a guest"),
  roomTypeId: z.string().min(1, "Choose a room type"),
  ratePlanId: z.string().optional(),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-in date"),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-out date"),
  notes: z.string().max(2000).optional(),
});

export async function createReservationAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    guestId: formData.get("guestId"),
    roomTypeId: formData.get("roomTypeId"),
    ratePlanId: (formData.get("ratePlanId") as string | null) || undefined,
    checkInDate: formData.get("checkInDate"),
    checkOutDate: formData.get("checkOutDate"),
    notes: (formData.get("notes") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const adults = Number(formData.get("adults") ?? 1);
  const children = Number(formData.get("children") ?? 0);
  if (!Number.isInteger(adults) || adults < 1 || adults > 20) throw new Error("Adults must be between 1 and 20");
  if (!Number.isInteger(children) || children < 0 || children > 20) throw new Error("Children must be between 0 and 20");

  const nights = nightsBetween(p.checkInDate, p.checkOutDate);
  if (nights < 1) throw new Error("Check-out must be after check-in");

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("reservations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();

  // Validate references belong to this hotel (cross-table, app-enforced).
  const [{ data: guest }, { data: roomType }] = await Promise.all([
    supabase.from("guests").select("id").eq("id", p.guestId).eq("hotel_id", hotel.id).single(),
    supabase.from("room_types").select("id, base_rate").eq("id", p.roomTypeId).eq("hotel_id", hotel.id).single(),
  ]);
  if (!guest) throw new Error("Guest does not belong to this hotel");
  if (!roomType) throw new Error("Room type does not belong to this hotel");

  let nightly = Number(roomType.base_rate);
  if (p.ratePlanId) {
    const { data: plan } = await supabase
      .from("rate_plans")
      .select("id, nightly_amount, room_type_id")
      .eq("id", p.ratePlanId)
      .eq("hotel_id", hotel.id)
      .single();
    if (!plan || plan.room_type_id !== p.roomTypeId) throw new Error("Rate plan does not match the room type");
    nightly = Number(plan.nightly_amount);
  }

  const available = await roomTypeAvailability(supabase, hotel.id, p.roomTypeId, p.checkInDate, p.checkOutDate);
  if (available <= 0) {
    throw new Error("No availability for this room type on the selected dates");
  }

  // M11: per-night total, honoring any rate_plan_seasons overrides for
  // p.ratePlanId — the same shared function M7's booking_create and M9's
  // API use, so all three reservation-creation paths price identically.
  const { data: nightlyTotal, error: pricingError } = await supabase.rpc("reservation_nightly_total", {
    p_rate_plan_id: p.ratePlanId || null,
    p_fallback_nightly: nightly,
    p_check_in: p.checkInDate,
    p_check_out: p.checkOutDate,
  });
  if (pricingError) throw new Error(pricingError.message);
  const totalAmount = Math.round(Number(nightlyTotal) * 100) / 100;

  let reservationId: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("reservations")
      .insert({
        organization_id: organization.id,
        hotel_id: hotel.id,
        confirmation_code: generateConfirmationCode(),
        guest_id: p.guestId,
        room_type_id: p.roomTypeId,
        rate_plan_id: p.ratePlanId || null,
        check_in_date: p.checkInDate,
        check_out_date: p.checkOutDate,
        adults,
        children,
        total_amount: totalAmount,
        currency: hotel.default_currency,
        notes: p.notes || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (!error && data) {
      reservationId = data.id;
      break;
    }
    if (error?.code === "23505") continue; // confirmation_code collision — retry
    throw new Error(error?.message ?? "Failed to create reservation");
  }
  if (!reservationId) throw new Error("Failed to create reservation after multiple attempts");

  // M11: real folio with per-night room-charge line items. Best-effort — a
  // folio hiccup must not undo an already-created, real reservation; staff
  // can still see/manage it, just without an auto-built folio this once.
  const { error: folioError } = await supabase.rpc("create_reservation_folio", { p_reservation_id: reservationId });
  if (folioError) {
    console.error(`Failed to create folio for reservation ${reservationId}:`, folioError.message);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "reservation.created",
    targetType: "reservation",
    targetId: reservationId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { room_type_id: p.roomTypeId, check_in: p.checkInDate, check_out: p.checkOutDate, total_amount: totalAmount },
  });

  await emitWebhookEvent({
    hotelId: hotel.id,
    eventType: "reservation.created",
    eventId: reservationId,
    data: { reservationId, roomTypeId: p.roomTypeId, checkInDate: p.checkInDate, checkOutDate: p.checkOutDate, totalAmount, currency: hotel.default_currency },
  });

  redirect(`/o/${organization.slug}/h/${hotel.slug}/reservations/${reservationId}`);
}

async function loadReservationForUpdate(hotelId: string, reservationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservations")
    .select("id, status, room_type_id, room_id, check_in_date, check_out_date")
    .eq("id", reservationId)
    .eq("hotel_id", hotelId)
    .single();
  return { supabase, reservation: data };
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  reservationId: z.string().min(1),
  nextStatus: z.enum(["confirmed", "cancelled", "no_show"]),
});

export async function setReservationStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    reservationId: formData.get("reservationId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("reservations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const { supabase, reservation } = await loadReservationForUpdate(hotel.id, p.reservationId);
  if (!reservation) throw new Error("Reservation not found");
  if (["checked_out", "cancelled", "no_show"].includes(reservation.status)) {
    throw new Error("This reservation is already closed");
  }

  const { error } = await supabase
    .from("reservations")
    .update({ status: p.nextStatus })
    .eq("id", p.reservationId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "reservation.status_changed",
    targetType: "reservation",
    targetId: p.reservationId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: p.nextStatus },
  });

  await emitWebhookEvent({
    hotelId: hotel.id,
    eventType: "reservation.status_changed",
    eventId: `${p.reservationId}:${p.nextStatus}`,
    data: { reservationId: p.reservationId, status: p.nextStatus },
  });
}

const checkInSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  reservationId: z.string().min(1),
  roomId: z.string().min(1, "Choose a room"),
});

export async function checkInReservationAction(formData: FormData): Promise<void> {
  const result = checkInSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    reservationId: formData.get("reservationId"),
    roomId: formData.get("roomId"),
  });
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("reservations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const { supabase, reservation } = await loadReservationForUpdate(hotel.id, p.reservationId);
  if (!reservation) throw new Error("Reservation not found");
  if (!["pending", "confirmed"].includes(reservation.status)) {
    throw new Error("Only a pending or confirmed reservation can be checked in");
  }

  // The chosen room must be an active room of the reservation's type.
  const { data: room } = await supabase
    .from("rooms")
    .select("id, room_type_id, status")
    .eq("id", p.roomId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!room || room.room_type_id !== reservation.room_type_id || room.status !== "active") {
    throw new Error("Selected room is not an active room of this reservation's type");
  }

  // ...and must not already be assigned to another occupying reservation whose
  // dates overlap this one's (app-enforced double-booking guard).
  const { count: conflicts } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotel.id)
    .eq("room_id", p.roomId)
    .in("status", OCCUPYING_STATUSES)
    .neq("id", p.reservationId)
    .lt("check_in_date", reservation.check_out_date)
    .gt("check_out_date", reservation.check_in_date);
  if ((conflicts ?? 0) > 0) {
    throw new Error("That room is already assigned to an overlapping reservation");
  }

  const { error } = await supabase
    .from("reservations")
    .update({ room_id: p.roomId, status: "checked_in" })
    .eq("id", p.reservationId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "reservation.checked_in",
    targetType: "reservation",
    targetId: p.reservationId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { room_id: p.roomId },
  });

  await emitWebhookEvent({
    hotelId: hotel.id,
    eventType: "reservation.checked_in",
    eventId: p.reservationId,
    data: { reservationId: p.reservationId, roomId: p.roomId },
  });
}

const checkOutSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  reservationId: z.string().min(1),
});

export async function checkOutReservationAction(formData: FormData): Promise<void> {
  const result = checkOutSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    reservationId: formData.get("reservationId"),
  });
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("reservations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const { supabase, reservation } = await loadReservationForUpdate(hotel.id, p.reservationId);
  if (!reservation) throw new Error("Reservation not found");
  if (reservation.status !== "checked_in") throw new Error("Only a checked-in reservation can be checked out");

  const { error } = await supabase
    .from("reservations")
    .update({ status: "checked_out" })
    .eq("id", p.reservationId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  // Mark the room dirty for housekeeping on departure, and open the actual
  // workflow task (M11) — the status flag is just the quick-glance signal.
  if (reservation.room_id) {
    await supabase.from("rooms").update({ housekeeping_status: "dirty" }).eq("id", reservation.room_id).eq("hotel_id", hotel.id);
    const { error: taskError } = await supabase.from("housekeeping_tasks").insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      room_id: reservation.room_id,
      task_type: "checkout_clean",
      created_by: user.id,
    });
    if (taskError) {
      console.error(`Failed to create checkout_clean task for room ${reservation.room_id}:`, taskError.message);
    }
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "reservation.checked_out",
    targetType: "reservation",
    targetId: p.reservationId,
    organizationId: organization.id,
    hotelId: hotel.id,
  });

  await emitWebhookEvent({
    hotelId: hotel.id,
    eventType: "reservation.checked_out",
    eventId: p.reservationId,
    data: { reservationId: p.reservationId },
  });
}
