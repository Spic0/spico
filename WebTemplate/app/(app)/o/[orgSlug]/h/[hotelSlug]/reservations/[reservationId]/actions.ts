"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

async function getFolioForReservation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hotelId: string,
  reservationId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase.from("folios").select("id").eq("hotel_id", hotelId).eq("reservation_id", reservationId).single();
  return data;
}

const chargeSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  reservationId: z.string().min(1),
  category: z.enum(["tax", "extra", "adjustment"]),
  description: z.string().min(1, "Description is required").max(200),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  unitAmount: z.coerce.number(),
});

export async function addFolioChargeAction(formData: FormData): Promise<void> {
  const result = chargeSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    reservationId: formData.get("reservationId"),
    category: formData.get("category"),
    description: formData.get("description"),
    quantity: formData.get("quantity") || 1,
    unitAmount: formData.get("unitAmount"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("folio.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const folio = await getFolioForReservation(supabase, hotel.id, p.reservationId);
  if (!folio) {
    await flash("error", "No folio exists for this reservation yet");
    return;
  }

  const { data: line, error } = await supabase
    .from("folio_line_items")
    .insert({
      folio_id: folio.id,
      category: p.category,
      description: p.description,
      quantity: p.quantity,
      unit_amount: p.unitAmount,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !line) {
    await flash("error", error?.message ?? "Failed to add charge");
    return;
  }

  await flash("success", "Charge added");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "folio.charge_added",
    targetType: "folio_line_item",
    targetId: line.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { category: p.category, description: p.description, quantity: p.quantity, unit_amount: p.unitAmount },
  });
}

const paymentSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  reservationId: z.string().min(1),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  method: z.enum(["cash", "card", "bank_transfer", "other"]),
  reference: z.string().max(200).optional(),
});

export async function recordFolioPaymentAction(formData: FormData): Promise<void> {
  const result = paymentSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    reservationId: formData.get("reservationId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    reference: (formData.get("reference") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("folio.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const folio = await getFolioForReservation(supabase, hotel.id, p.reservationId);
  if (!folio) {
    await flash("error", "No folio exists for this reservation yet");
    return;
  }

  const { data: payment, error } = await supabase
    .from("folio_payments")
    .insert({
      folio_id: folio.id,
      amount: p.amount,
      method: p.method,
      reference: p.reference || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !payment) {
    await flash("error", error?.message ?? "Failed to record payment");
    return;
  }

  await flash("success", "Payment recorded");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "folio.payment_recorded",
    targetType: "folio_payment",
    targetId: payment.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { amount: p.amount, method: p.method, provider: "stub" },
  });
}

const closeSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  reservationId: z.string().min(1),
});

export async function closeFolioAction(formData: FormData): Promise<void> {
  const result = closeSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    reservationId: formData.get("reservationId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("folio.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const folio = await getFolioForReservation(supabase, hotel.id, p.reservationId);
  if (!folio) {
    await flash("error", "No folio exists for this reservation yet");
    return;
  }

  const { error } = await supabase
    .from("folios")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: user.id })
    .eq("id", folio.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", "Folio closed");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "folio.closed",
    targetType: "folio",
    targetId: folio.id,
    organizationId: organization.id,
    hotelId: hotel.id,
  });
}
