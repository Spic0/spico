"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const agentTypeValues = [
  "receptionist",
  "reservations",
  "concierge",
  "night",
  "restaurant",
  "spa",
  "general_information",
] as const;
const operatingModeValues = ["manual_assist", "semi_automatic", "automatic"] as const;

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const overviewSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().max(1000).optional(),
  agentType: z.enum(agentTypeValues),
  operatingMode: z.enum(operatingModeValues),
  greetingMessage: z.string().max(1000).optional(),
  fallbackMessage: z.string().max(1000).optional(),
  handoffMessage: z.string().max(1000).optional(),
  knowledgeBaseEnabled: z.boolean(),
  testModeEnabled: z.boolean(),
});

export async function updateAgentOverviewAction(formData: FormData): Promise<void> {
  const result = overviewSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    name: formData.get("name"),
    description: emptyToUndefined(formData.get("description")),
    agentType: formData.get("agentType"),
    operatingMode: formData.get("operatingMode"),
    greetingMessage: emptyToUndefined(formData.get("greetingMessage")),
    fallbackMessage: emptyToUndefined(formData.get("fallbackMessage")),
    handoffMessage: emptyToUndefined(formData.get("handoffMessage")),
    knowledgeBaseEnabled: formData.get("knowledgeBaseEnabled") === "on",
    testModeEnabled: formData.get("testModeEnabled") === "on",
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const before = await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.update", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("ai_agents")
    .update({
      name: parsed.name,
      description: parsed.description ?? null,
      agent_type: parsed.agentType,
      operating_mode: parsed.operatingMode,
      greeting_message: parsed.greetingMessage ?? null,
      fallback_message: parsed.fallbackMessage ?? null,
      handoff_message: parsed.handoffMessage ?? null,
      knowledge_base_enabled: parsed.knowledgeBaseEnabled,
      test_mode_enabled: parsed.testModeEnabled,
      updated_by: user.id,
    })
    .eq("id", parsed.agentId)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Not authorized to update this agent (name may already be in use)");
    return;
  }

  await flash("success", `${parsed.name} saved`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.updated",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before,
    after: parsed,
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}`);
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  nextStatus: z.enum(["draft", "active", "inactive", "archived"]),
});

async function setAgentStatus(formData: FormData, permission: "ai_agents.activate" | "ai_agents.archive"): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const before = await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission(permission, { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("ai_agents")
    .update({ status: parsed.nextStatus, updated_by: user.id })
    .eq("id", parsed.agentId)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Not authorized to change this agent's status");
    return;
  }

  await flash(
    "success",
    parsed.nextStatus === "archived"
      ? "Agent archived"
      : parsed.nextStatus === "active"
        ? "Agent activated"
        : parsed.nextStatus === "inactive"
          ? "Agent deactivated"
          : "Agent set to draft",
  );

  await writeAuditLog({
    actorProfileId: user.id,
    action: parsed.nextStatus === "archived" ? "ai_agent.archived" : `ai_agent.status_changed`,
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before: { status: before.status },
    after: { status: parsed.nextStatus },
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}`);
  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents`);
}

export async function setAgentActivationAction(formData: FormData): Promise<void> {
  return setAgentStatus(formData, "ai_agents.activate");
}

export async function archiveAgentAction(formData: FormData): Promise<void> {
  return setAgentStatus(formData, "ai_agents.archive");
}
