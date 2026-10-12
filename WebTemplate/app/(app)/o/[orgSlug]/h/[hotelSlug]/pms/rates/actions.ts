"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

const codeSchema = z
  .string()
  .min(1, "Code is required")
  .max(20)
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));

function parseMoney(raw: FormDataEntryValue | null): number {
  const n = Number((raw as string | null)?.trim() ?? "");
  if (!Number.isFinite(n) || n < 0) throw new Error("Nightly amount must be a non-negative number");
  return Math.round(n * 100) / 100;
}

async function assertRoomTypeInHotel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomTypeId: string,
  hotelId: string,
): Promise<void> {
  const { data } = await supabase.from("room_types").select("id").eq("id", roomTypeId).eq("hotel_id", hotelId).single();
  if (!data) throw new Error("Room type does not belong to this hotel");
}

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  roomTypeId: z.string().min(1, "Choose a room type"),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  code: codeSchema,
});

export async function createRatePlanAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    roomTypeId: formData.get("roomTypeId"),
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;
  const nightlyAmount = parseMoney(formData.get("nightlyAmount"));

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  await assertRoomTypeInHotel(supabase, p.roomTypeId, hotel.id);

  const { data: plan, error } = await supabase
    .from("rate_plans")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      room_type_id: p.roomTypeId,
      name: p.name,
      code: p.code,
      nightly_amount: nightlyAmount,
      refundable: formData.get("refundable") === "on",
      includes_breakfast: formData.get("includesBreakfast") === "on",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !plan) {
    throw new Error(error?.message ?? "Failed to create rate plan (code may already be in use)");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "rate_plan.created",
    targetType: "rate_plan",
    targetId: plan.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, code: p.code, nightly_amount: nightlyAmount },
  });
}

const updateSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  ratePlanId: z.string().min(1),
  name: z.string().min(2).max(120),
  status: z.enum(["active", "inactive"]),
});

export async function updateRatePlanAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    ratePlanId: formData.get("ratePlanId"),
    name: formData.get("name"),
    status: formData.get("status"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;
  const nightlyAmount = parseMoney(formData.get("nightlyAmount"));

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("rate_plans")
    .update({
      name: p.name,
      nightly_amount: nightlyAmount,
      refundable: formData.get("refundable") === "on",
      includes_breakfast: formData.get("includesBreakfast") === "on",
      status: p.status,
    })
    .eq("id", p.ratePlanId)
    .eq("hotel_id", hotel.id)
    .select("id")
    .single();

  if (error || !updated) {
    throw new Error(error?.message ?? "Failed to update rate plan");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "rate_plan.updated",
    targetType: "rate_plan",
    targetId: p.ratePlanId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, nightly_amount: nightlyAmount, status: p.status },
  });
}
