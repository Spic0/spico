"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { CAPABILITY_REGISTRY } from "@/lib/agentCapabilities";

const agentTypeValues = [
  "receptionist",
  "reservations",
  "concierge",
  "night",
  "restaurant",
  "spa",
  "general_information",
] as const;

const schema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().max(1000).optional(),
  agentType: z.enum(agentTypeValues),
  defaultLanguage: z.string().min(1, "Choose a default language"),
});

// Creates the agent plus every 1:1 child row it needs (default language,
// full capability set from the registry, handoff rules, approval policy,
// and prompt version 1) so every tab has something to edit immediately
// instead of each tab needing its own "create if missing" logic.
export async function createAgentAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
    agentType: formData.get("agentType"),
    defaultLanguage: formData.get("defaultLanguage"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);

  if (!hotel.languages.includes(parsed.defaultLanguage)) {
    throw new Error("Default language must be one of the hotel's supported languages");
  }

  const user = await requirePermission("ai_agents.create", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const baseSlug = slugify(parsed.name) || "agent";
  let slug = baseSlug;
  let agentId: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("ai_agents")
      .insert({
        organization_id: organization.id,
        hotel_id: hotel.id,
        name: parsed.name,
        slug,
        description: parsed.description ?? null,
        agent_type: parsed.agentType,
        default_language: parsed.defaultLanguage,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      agentId = data.id;
      slug = data.slug;
      break;
    }

    if (error?.code === "23505") {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }

    throw new Error(error?.message ?? "Failed to create agent (name may already be in use for this hotel)");
  }

  if (!agentId) {
    throw new Error("Failed to create agent after multiple attempts");
  }

  const { error: languageError } = await supabase.from("ai_agent_languages").insert({
    agent_id: agentId,
    language_code: parsed.defaultLanguage,
    enabled: true,
    is_default: true,
  });
  if (languageError) {
    throw new Error(`Agent created but failed to set its default language: ${languageError.message}`);
  }

  const { error: capabilitiesError } = await supabase.from("ai_agent_capabilities").insert(
    CAPABILITY_REGISTRY.map((capability) => ({
      agent_id: agentId,
      capability_key: capability.key,
      enabled: capability.protected,
      approval_required: capability.defaultApprovalRequired,
    })),
  );
  if (capabilitiesError) {
    throw new Error(`Agent created but failed to seed capabilities: ${capabilitiesError.message}`);
  }

  const { error: handoffError } = await supabase.from("ai_agent_handoff_rules").insert({ agent_id: agentId });
  if (handoffError) {
    throw new Error(`Agent created but failed to seed handoff rules: ${handoffError.message}`);
  }

  const { error: policyError } = await supabase.from("ai_agent_approval_policies").insert({ agent_id: agentId });
  if (policyError) {
    throw new Error(`Agent created but failed to seed approval policy: ${policyError.message}`);
  }

  const { error: promptError } = await supabase.from("ai_agent_prompt_versions").insert({
    agent_id: agentId,
    version_number: 1,
    is_active: true,
    created_by: user.id,
  });
  if (promptError) {
    throw new Error(`Agent created but failed to seed its first prompt version: ${promptError.message}`);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.created",
    targetType: "ai_agent",
    targetId: agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: parsed.name, slug, agentType: parsed.agentType },
  });

  redirect(`/o/${organization.slug}/h/${hotel.slug}/agents/${agentId}`);
}
