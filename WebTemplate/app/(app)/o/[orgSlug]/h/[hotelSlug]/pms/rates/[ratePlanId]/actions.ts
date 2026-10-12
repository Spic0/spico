"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  ratePlanId: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date"),
  dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date"),
  nightlyAmount: z.coerce.number().min(0),
});

export async function createRatePlanSeasonAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    ratePlanId: formData.get("ratePlanId"),
    name: formData.get("name"),
    dateStart: formData.get("dateStart"),
    dateEnd: formData.get("dateEnd"),
    nightlyAmount: formData.get("nightlyAmount"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;
  if (p.dateEnd < p.dateStart) {
    throw new Error("End date must be on or after the start date");
  }

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: plan } = await supabase.from("rate_plans").select("id").eq("id", p.ratePlanId).eq("hotel_id", hotel.id).single();
  if (!plan) throw new Error("Rate plan does not belong to this hotel");

  const { data: season, error } = await supabase
    .from("rate_plan_seasons")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      rate_plan_id: p.ratePlanId,
      name: p.name,
      date_start: p.dateStart,
      date_end: p.dateEnd,
      nightly_amount: p.nightlyAmount,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !season) throw new Error(error?.message ?? "Failed to create season");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "rate_plan_season.created",
    targetType: "rate_plan_season",
    targetId: season.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, date_start: p.dateStart, date_end: p.dateEnd, nightly_amount: p.nightlyAmount },
  });
}

const deleteSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  seasonId: z.string().min(1),
});

export async function deleteRatePlanSeasonAction(formData: FormData): Promise<void> {
  const result = deleteSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    seasonId: formData.get("seasonId"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { error } = await supabase.from("rate_plan_seasons").delete().eq("id", p.seasonId).eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "rate_plan_season.deleted",
    targetType: "rate_plan_season",
    targetId: p.seasonId,
    organizationId: organization.id,
    hotelId: hotel.id,
  });
}
