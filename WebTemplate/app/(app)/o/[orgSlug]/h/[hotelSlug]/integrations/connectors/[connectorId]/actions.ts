"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { OCCUPYING_STATUSES } from "@/lib/pms";
import type { SyncDirection } from "@/lib/channelSync";

// "Sync" assembles REAL current data from this hotel's own tables — nothing
// is invented — but never transmits it anywhere. No OTA/channel-manager
// credentials or HTTP call exist. See lib/channelSync.ts and docs/roadmap.md.

const syncSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  connectorId: z.string().min(1),
  direction: z.enum(["push_rates", "push_availability", "pull_reservations"]),
});

export async function runChannelSyncAction(formData: FormData): Promise<void> {
  const result = syncSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    connectorId: formData.get("connectorId"),
    direction: formData.get("direction"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;
  const direction = p.direction as SyncDirection;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("integrations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: connector } = await supabase
    .from("integrations")
    .select("id, integration_type")
    .eq("id", p.connectorId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!connector || connector.integration_type !== "channel_manager") {
    throw new Error("Connector not found or is not a channel-manager connector");
  }

  const startedAt = new Date().toISOString();
  const summary = await assembleSyncSummary(supabase, hotel.id, direction);

  const { data: log, error } = await supabase
    .from("channel_manager_sync_logs")
    .insert({
      integration_id: connector.id,
      direction,
      status: "success",
      summary,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !log) throw new Error(error?.message ?? "Failed to record sync log");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "channel_sync.run",
    targetType: "channel_manager_sync_log",
    targetId: log.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { direction },
  });
}

async function assembleSyncSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hotelId: string,
  direction: SyncDirection,
): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().slice(0, 10);

  if (direction === "push_rates") {
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, base_rate")
      .eq("hotel_id", hotelId)
      .eq("status", "active");
    const results = await Promise.all(
      (roomTypes ?? []).map(async (rt) => {
        const { data: plans } = await supabase
          .from("rate_plans")
          .select("id, name, nightly_amount")
          .eq("hotel_id", hotelId)
          .eq("room_type_id", rt.id)
          .eq("status", "active");
        const plansWithTodayRate = await Promise.all(
          (plans ?? []).map(async (plan) => {
            const { data: rate } = await supabase.rpc("rate_plan_nightly_rate", {
              p_rate_plan_id: plan.id,
              p_night: today,
              p_fallback: plan.nightly_amount,
            });
            return { id: plan.id, name: plan.name, nightly_rate_today: rate ?? plan.nightly_amount };
          }),
        );
        return { id: rt.id, name: rt.name, base_rate: rt.base_rate, plans: plansWithTodayRate };
      }),
    );
    return { as_of: today, room_types: results };
  }

  if (direction === "push_availability") {
    const { data: roomTypes } = await supabase.from("room_types").select("id, name").eq("hotel_id", hotelId).eq("status", "active");
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const results = await Promise.all(
      (roomTypes ?? []).map(async (rt) => {
        const [{ count: roomCount }, { count: occupied }] = await Promise.all([
          supabase
            .from("rooms")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", hotelId)
            .eq("room_type_id", rt.id)
            .eq("status", "active")
            .neq("housekeeping_status", "out_of_service"),
          supabase
            .from("reservations")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", hotelId)
            .eq("room_type_id", rt.id)
            .in("status", OCCUPYING_STATUSES)
            .lt("check_in_date", tomorrow)
            .gt("check_out_date", today),
        ]);
        return { id: rt.id, name: rt.name, available_today: Math.max(0, (roomCount ?? 0) - (occupied ?? 0)) };
      }),
    );
    return { as_of: today, room_types: results };
  }

  // pull_reservations
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: reservations, count } = await supabase
    .from("reservations")
    .select("confirmation_code, status, check_in_date, check_out_date, source", { count: "exact" })
    .eq("hotel_id", hotelId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);
  return { since, total_count: count ?? 0, sample: reservations ?? [] };
}
