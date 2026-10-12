"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

function textOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const editableFieldsSchema = z.object({
  purpose: z.string().max(2000).optional(),
  hotelIdentity: z.string().max(2000).optional(),
  toneOfVoice: z.string().max(2000).optional(),
  greetingStyle: z.string().max(2000).optional(),
  communicationRules: z.string().max(2000).optional(),
  languageBehavior: z.string().max(2000).optional(),
  escalationRules: z.string().max(2000).optional(),
  safetyRules: z.string().max(2000).optional(),
  policyReferences: z.string().max(2000).optional(),
  additionalInstructions: z.string().max(2000).optional(),
});

const updateSchema = z
  .object({
    orgSlug: z.string().min(1),
    hotelSlug: z.string().min(1),
    agentId: z.string().min(1),
  })
  .merge(editableFieldsSchema);

// Editing always inserts a NEW version — existing versions are immutable.
export async function updateAgentPromptAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    purpose: textOrUndefined(formData.get("purpose")),
    hotelIdentity: textOrUndefined(formData.get("hotelIdentity")),
    toneOfVoice: textOrUndefined(formData.get("toneOfVoice")),
    greetingStyle: textOrUndefined(formData.get("greetingStyle")),
    communicationRules: textOrUndefined(formData.get("communicationRules")),
    languageBehavior: textOrUndefined(formData.get("languageBehavior")),
    escalationRules: textOrUndefined(formData.get("escalationRules")),
    safetyRules: textOrUndefined(formData.get("safetyRules")),
    policyReferences: textOrUndefined(formData.get("policyReferences")),
    additionalInstructions: textOrUndefined(formData.get("additionalInstructions")),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.manage_prompts", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const nextVersion = agent.current_prompt_version + 1;
  const supabase = await createClient();

  const { error: deactivateError } = await supabase
    .from("ai_agent_prompt_versions")
    .update({ is_active: false })
    .eq("agent_id", parsed.agentId)
    .eq("is_active", true);
  if (deactivateError) {
    throw new Error(`Failed to save new prompt version: ${deactivateError.message}`);
  }

  const { error: insertError } = await supabase.from("ai_agent_prompt_versions").insert({
    agent_id: parsed.agentId,
    version_number: nextVersion,
    purpose: parsed.purpose ?? null,
    hotel_identity: parsed.hotelIdentity ?? null,
    tone_of_voice: parsed.toneOfVoice ?? null,
    greeting_style: parsed.greetingStyle ?? null,
    communication_rules: parsed.communicationRules ?? null,
    language_behavior: parsed.languageBehavior ?? null,
    escalation_rules: parsed.escalationRules ?? null,
    safety_rules: parsed.safetyRules ?? null,
    policy_references: parsed.policyReferences ?? null,
    additional_instructions: parsed.additionalInstructions ?? null,
    is_active: true,
    created_by: user.id,
  });
  if (insertError) {
    throw new Error(`Failed to save new prompt version: ${insertError.message}`);
  }

  const { error: agentError } = await supabase
    .from("ai_agents")
    .update({ current_prompt_version: nextVersion, updated_by: user.id })
    .eq("id", parsed.agentId);
  if (agentError) {
    throw new Error(`Prompt version saved but failed to update the agent's current version: ${agentError.message}`);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.prompt_version_created",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { versionNumber: nextVersion },
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}/prompt`);
}

const restoreSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  versionNumber: z.coerce.number().int().min(1),
});

// Restoring copies the target version's content into a brand-new version row
// — history is never reordered or deleted.
export async function restoreAgentPromptVersionAction(formData: FormData): Promise<void> {
  const result = restoreSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    versionNumber: formData.get("versionNumber"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.restore_prompt_version", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: target, error: targetError } = await supabase
    .from("ai_agent_prompt_versions")
    .select(
      "purpose, hotel_identity, tone_of_voice, greeting_style, communication_rules, language_behavior, escalation_rules, safety_rules, policy_references, additional_instructions",
    )
    .eq("agent_id", parsed.agentId)
    .eq("version_number", parsed.versionNumber)
    .single();

  if (targetError || !target) {
    throw new Error(targetError?.message ?? "Version not found");
  }

  const nextVersion = agent.current_prompt_version + 1;

  const { error: deactivateError } = await supabase
    .from("ai_agent_prompt_versions")
    .update({ is_active: false })
    .eq("agent_id", parsed.agentId)
    .eq("is_active", true);
  if (deactivateError) {
    throw new Error(`Failed to restore version: ${deactivateError.message}`);
  }

  const { error: insertError } = await supabase.from("ai_agent_prompt_versions").insert({
    ...target,
    agent_id: parsed.agentId,
    version_number: nextVersion,
    is_active: true,
    created_by: user.id,
  });
  if (insertError) {
    throw new Error(`Failed to restore version: ${insertError.message}`);
  }

  const { error: agentError } = await supabase
    .from("ai_agents")
    .update({ current_prompt_version: nextVersion, updated_by: user.id })
    .eq("id", parsed.agentId);
  if (agentError) {
    throw new Error(`Version restored but failed to update the agent's current version: ${agentError.message}`);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.prompt_version_restored",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before: { restoredFromVersion: parsed.versionNumber },
    after: { versionNumber: nextVersion },
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}/prompt`);
}
