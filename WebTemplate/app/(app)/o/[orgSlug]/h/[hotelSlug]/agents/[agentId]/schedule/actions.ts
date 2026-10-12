"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const dayShape = z
  .object({
    closed: z.boolean(),
    open: z.string().regex(TIME_RE).optional(),
    close: z.string().regex(TIME_RE).optional(),
  })
  .refine((d) => d.closed || (d.open !== undefined && d.close !== undefined && d.open < d.close), {
    message: "Provide a valid open/close time or mark the day closed",
  });

const scheduleSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  useHotelHours: z.boolean(),
  holidayBehavior: z.enum(["follow_hotel", "operate_normally", "custom_rule"]),
  outsideHoursBehavior: z.enum([
    "transfer_reception",
    "transfer_oncall",
    "create_message_request",
    "fallback_message",
    "disable_agent",
  ]),
});

export async function updateAgentScheduleAction(formData: FormData): Promise<void> {
  const result = scheduleSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    useHotelHours: formData.get("useHotelHours") === "on",
    holidayBehavior: formData.get("holidayBehavior"),
    outsideHoursBehavior: formData.get("outsideHoursBehavior"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.manage_schedules", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();

  const { error: agentError } = await supabase
    .from("ai_agents")
    .update({
      use_hotel_business_hours: parsed.useHotelHours,
      holiday_behavior: parsed.holidayBehavior,
      outside_hours_behavior: parsed.outsideHoursBehavior,
      updated_by: user.id,
    })
    .eq("id", parsed.agentId);
  if (agentError) {
    await flash("error", `Failed to save schedule settings: ${agentError.message}`);
    return;
  }

  if (!parsed.useHotelHours) {
    const rows: {
      agent_id: string;
      day_of_week: number;
      shift_index: number;
      is_closed: boolean;
      open_time: string | null;
      close_time: string | null;
    }[] = [];

    for (let day = 1; day <= 7; day += 1) {
      const dayResult = dayShape.safeParse({
        closed: formData.get(`day_${day}_closed`) === "on",
        open: timeOrUndefined(formData.get(`day_${day}_open`)),
        close: timeOrUndefined(formData.get(`day_${day}_close`)),
      });
      if (!dayResult.success) {
        await flash("error", `Day ${day}: ${dayResult.error.issues[0]?.message ?? "invalid schedule"}`);
        return;
      }
      const d = dayResult.data;
      rows.push({
        agent_id: parsed.agentId,
        day_of_week: day,
        shift_index: 1,
        is_closed: d.closed,
        open_time: d.closed ? null : (d.open ?? null),
        close_time: d.closed ? null : (d.close ?? null),
      });
    }

    const { error: upsertError } = await supabase
      .from("ai_agent_schedules")
      .upsert(rows, { onConflict: "agent_id,day_of_week,shift_index" });
    if (upsertError) {
      await flash("error", `Failed to save override schedule: ${upsertError.message}`);
      return;
    }
  }

  await flash("success", "Schedule saved");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.schedule_updated",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: parsed,
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}/schedule`);
}

const handoffSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  handoffEnabled: z.boolean(),
  primaryDepartmentId: z.string().optional(),
  primaryPhonePlaceholder: z.string().max(60).optional(),
  backupPhonePlaceholder: z.string().max(60).optional(),
  conditionGuestRequestsHuman: z.boolean(),
  conditionLowConfidence: z.boolean(),
  conditionUnsupportedLanguage: z.boolean(),
  conditionEmergency: z.boolean(),
  conditionOutsideHours: z.boolean(),
  conditionCapabilityDisabled: z.boolean(),
  conditionHighRisk: z.boolean(),
  handoffMessage: z.string().max(1000).optional(),
  fallbackWhenUnavailable: z.enum(["create_message_request", "fallback_message", "keep_trying_backup"]),
});

export async function updateAgentHandoffAction(formData: FormData): Promise<void> {
  const result = handoffSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    handoffEnabled: formData.get("handoffEnabled") === "on",
    primaryDepartmentId: (formData.get("primaryDepartmentId") as string | null) || undefined,
    primaryPhonePlaceholder: (formData.get("primaryPhonePlaceholder") as string | null)?.trim() || undefined,
    backupPhonePlaceholder: (formData.get("backupPhonePlaceholder") as string | null)?.trim() || undefined,
    conditionGuestRequestsHuman: formData.get("conditionGuestRequestsHuman") === "on",
    conditionLowConfidence: formData.get("conditionLowConfidence") === "on",
    conditionUnsupportedLanguage: formData.get("conditionUnsupportedLanguage") === "on",
    conditionEmergency: formData.get("conditionEmergency") === "on",
    conditionOutsideHours: formData.get("conditionOutsideHours") === "on",
    conditionCapabilityDisabled: formData.get("conditionCapabilityDisabled") === "on",
    conditionHighRisk: formData.get("conditionHighRisk") === "on",
    handoffMessage: (formData.get("handoffMessage") as string | null)?.trim() || undefined,
    fallbackWhenUnavailable: formData.get("fallbackWhenUnavailable"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.manage_handoff", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_agent_handoff_rules")
    .update({
      handoff_enabled: parsed.handoffEnabled,
      primary_department_id: parsed.primaryDepartmentId ?? null,
      primary_phone_placeholder: parsed.primaryPhonePlaceholder ?? null,
      backup_phone_placeholder: parsed.backupPhonePlaceholder ?? null,
      condition_guest_requests_human: parsed.conditionGuestRequestsHuman,
      condition_low_confidence: parsed.conditionLowConfidence,
      condition_unsupported_language: parsed.conditionUnsupportedLanguage,
      condition_emergency: parsed.conditionEmergency,
      condition_outside_hours: parsed.conditionOutsideHours,
      condition_capability_disabled: parsed.conditionCapabilityDisabled,
      condition_high_risk: parsed.conditionHighRisk,
      handoff_message: parsed.handoffMessage ?? null,
      fallback_when_unavailable: parsed.fallbackWhenUnavailable,
    })
    .eq("agent_id", parsed.agentId);

  if (error) {
    await flash("error", `Failed to save handoff rules: ${error.message}`);
    return;
  }

  await flash("success", "Handoff rules saved");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.handoff_updated",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: parsed,
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}/schedule`);
}
