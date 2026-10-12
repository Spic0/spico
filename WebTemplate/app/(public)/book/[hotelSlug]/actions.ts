"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { emitWebhookEvent } from "@/lib/webhooks";

// Public booking submission. No auth: runs as anon and goes through the
// SECURITY DEFINER booking_create RPC, which re-validates enabled/dates/
// occupancy/availability server-side. The hotel is resolved from the slug via
// the public RPC (not trusted from a hidden field).
const schema = z.object({
  hotelSlug: z.string().min(1),
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-in date"),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid check-out date"),
  firstName: z.string().min(1, "First name is required").max(120),
  lastName: z.string().min(1, "Last name is required").max(120),
  email: z.string().max(200).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Invalid email").optional().or(z.literal("")),
  phone: z.string().max(60).optional(),
});

export async function createPublicBookingAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    hotelSlug: formData.get("hotelSlug"),
    roomTypeId: formData.get("roomTypeId"),
    ratePlanId: (formData.get("ratePlanId") as string | null) || undefined,
    checkIn: formData.get("checkIn"),
    checkOut: formData.get("checkOut"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: (formData.get("email") as string | null)?.trim() || undefined,
    phone: (formData.get("phone") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const adults = Number(formData.get("adults") ?? 1);
  const children = Number(formData.get("children") ?? 0);

  const supabase = await createClient();

  const { data: hotelRows, error: hotelError } = await supabase.rpc("booking_hotel_public", {
    p_hotel_slug: p.hotelSlug,
  });
  if (hotelError) throw new Error(hotelError.message);
  const hotel = hotelRows?.[0];
  if (!hotel || !hotel.enabled) {
    throw new Error("Online booking is not available for this hotel");
  }

  const { data, error } = await supabase.rpc("booking_create", {
    p_hotel_id: hotel.hotel_id,
    p_room_type_id: p.roomTypeId,
    p_rate_plan_id: p.ratePlanId || null,
    p_check_in: p.checkIn,
    p_check_out: p.checkOut,
    p_adults: adults,
    p_children: children,
    p_first_name: p.firstName,
    p_last_name: p.lastName,
    p_email: p.email || null,
    p_phone: p.phone || null,
  });
  if (error) {
    // The RPC raises human-readable messages (e.g. "No availability for the selected dates").
    throw new Error(error.message);
  }

  const code = data?.[0]?.confirmation_code;
  if (!code) throw new Error("Booking could not be completed");

  // The RPC only returns confirmation_code/total_amount/currency, not the
  // reservation id — the confirmation code is unique per hotel, so it's used
  // as the idempotency-relevant event id here instead.
  await emitWebhookEvent({
    hotelId: hotel.hotel_id,
    eventType: "reservation.created",
    eventId: code,
    data: { confirmationCode: code, roomTypeId: p.roomTypeId, checkInDate: p.checkIn, checkOutDate: p.checkOut, source: "booking_engine" },
  });

  redirect(`/book/${p.hotelSlug}/confirmed?code=${encodeURIComponent(code)}`);
}
