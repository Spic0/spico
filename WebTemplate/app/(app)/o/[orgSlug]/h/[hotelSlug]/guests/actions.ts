"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

const fields = {
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  firstName: z.string().min(1, "First name is required").max(120),
  lastName: z.string().min(1, "Last name is required").max(120),
  email: z.string().max(200).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Invalid email").optional().or(z.literal("")),
  phone: z.string().max(60).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/, "Use a 2-letter country code").optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
};

function parseVip(formData: FormData): boolean {
  const v = formData.get("vip");
  return v === "on" || v === "true";
}

const createSchema = z.object(fields);

export async function createGuestAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: (formData.get("email") as string | null)?.trim() || undefined,
    phone: (formData.get("phone") as string | null)?.trim() || undefined,
    countryCode: (formData.get("countryCode") as string | null)?.trim().toUpperCase() || undefined,
    notes: (formData.get("notes") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("guests.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: guest, error } = await supabase
    .from("guests")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      first_name: p.firstName,
      last_name: p.lastName,
      email: p.email || null,
      phone: p.phone || null,
      country_code: p.countryCode || null,
      vip: parseVip(formData),
      notes: p.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !guest) {
    throw new Error(error?.message ?? "Failed to create guest");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "guest.created",
    targetType: "guest",
    targetId: guest.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: `${p.firstName} ${p.lastName}` },
  });
}

const updateSchema = z.object({ ...fields, guestId: z.string().min(1) });

export async function updateGuestAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    guestId: formData.get("guestId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: (formData.get("email") as string | null)?.trim() || undefined,
    phone: (formData.get("phone") as string | null)?.trim() || undefined,
    countryCode: (formData.get("countryCode") as string | null)?.trim().toUpperCase() || undefined,
    notes: (formData.get("notes") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("guests.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("guests")
    .update({
      first_name: p.firstName,
      last_name: p.lastName,
      email: p.email || null,
      phone: p.phone || null,
      country_code: p.countryCode || null,
      vip: parseVip(formData),
      notes: p.notes || null,
    })
    .eq("id", p.guestId)
    .eq("hotel_id", hotel.id)
    .select("id")
    .single();

  if (error || !updated) {
    throw new Error(error?.message ?? "Failed to update guest");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "guest.updated",
    targetType: "guest",
    targetId: p.guestId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: `${p.firstName} ${p.lastName}` },
  });
}
