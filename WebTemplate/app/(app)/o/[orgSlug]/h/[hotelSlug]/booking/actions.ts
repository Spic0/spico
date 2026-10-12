"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const schema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  terms: z.string().max(4000).optional(),
});

function parseNights(raw: FormDataEntryValue | null, label: string, min: number, max: number): number {
  const n = Number((raw as string | null)?.trim() ?? "");
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return n;
}

export async function saveBookingSettingsAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    terms: (formData.get("terms") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const minNights = parseNights(formData.get("minNights"), "Minimum nights", 1, 90);
  const maxNights = parseNights(formData.get("maxNights"), "Maximum nights", 1, 365);
  if (maxNights < minNights) {
    await flash("error", "Maximum nights must be at least the minimum");
    return;
  }
  const enabled = formData.get("enabled") === "on";

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("booking.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { error } = await supabase.from("booking_settings").upsert(
    {
      organization_id: organization.id,
      hotel_id: hotel.id,
      enabled,
      min_nights: minNights,
      max_nights: maxNights,
      terms: p.terms || null,
      created_by: user.id,
    },
    { onConflict: "hotel_id" },
  );

  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", enabled ? "Booking engine settings saved (enabled)" : "Booking engine settings saved");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "booking_settings.saved",
    targetType: "booking_settings",
    targetId: hotel.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { enabled, min_nights: minNights, max_nights: maxNights },
  });
}
