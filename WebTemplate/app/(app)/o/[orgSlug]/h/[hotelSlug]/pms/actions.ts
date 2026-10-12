"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const codeSchema = z
  .string()
  .min(1, "Code is required")
  .max(20)
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));

function parseMoney(raw: FormDataEntryValue | null, label: string): number {
  const n = Number((raw as string | null)?.trim() ?? "");
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a non-negative number`);
  return Math.round(n * 100) / 100;
}

function parseIntInRange(raw: FormDataEntryValue | null, label: string, min: number, max: number): number {
  const n = Number((raw as string | null)?.trim() ?? "");
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return n;
}

const baseSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  code: codeSchema,
  description: z.string().max(1000).optional(),
});

export async function createRoomTypeAction(formData: FormData): Promise<void> {
  const result = baseSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
    code: formData.get("code"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;
  const maxOccupancy = parseIntInRange(formData.get("maxOccupancy"), "Max occupancy", 1, 20);
  const baseRate = parseMoney(formData.get("baseRate"), "Base rate");

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: roomType, error } = await supabase
    .from("room_types")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      name: p.name,
      code: p.code,
      description: p.description || null,
      max_occupancy: maxOccupancy,
      base_rate: baseRate,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !roomType) {
    await flash("error", error?.message ?? "Failed to create room type (code may already be in use)");
    return;
  }

  await flash("success", `Room type ${p.name} created`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "room_type.created",
    targetType: "room_type",
    targetId: roomType.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, code: p.code, base_rate: baseRate },
  });
}

export async function updateRoomTypeAction(formData: FormData): Promise<void> {
  const result = z.object({ ...baseSchema.shape, roomTypeId: z.string().min(1) }).safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    roomTypeId: formData.get("roomTypeId"),
    name: formData.get("name"),
    code: formData.get("code"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;
  const maxOccupancy = parseIntInRange(formData.get("maxOccupancy"), "Max occupancy", 1, 20);
  const baseRate = parseMoney(formData.get("baseRate"), "Base rate");

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("room_types")
    .update({ name: p.name, code: p.code, description: p.description || null, max_occupancy: maxOccupancy, base_rate: baseRate })
    .eq("id", p.roomTypeId)
    .eq("hotel_id", hotel.id)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to update room type");
    return;
  }

  await flash("success", `Room type ${p.name} saved`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "room_type.updated",
    targetType: "room_type",
    targetId: p.roomTypeId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, code: p.code, base_rate: baseRate },
  });
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  roomTypeId: z.string().min(1),
  nextStatus: z.enum(["active", "inactive"]),
});

export async function setRoomTypeStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    roomTypeId: formData.get("roomTypeId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { error } = await supabase
    .from("room_types")
    .update({ status: p.nextStatus })
    .eq("id", p.roomTypeId)
    .eq("hotel_id", hotel.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", p.nextStatus === "active" ? "Room type activated" : "Room type deactivated");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "room_type.status_changed",
    targetType: "room_type",
    targetId: p.roomTypeId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: p.nextStatus },
  });
}
