"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { simulateAgentTest } from "@/lib/agentTestSimulation";

const schema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  sampleMessage: z.string().min(1, "Enter a sample guest message").max(2000),
  testLanguage: z.string().min(1, "Choose a test language"),
});

// Configuration Simulation only. No AI request, message, call, or external
// action is ever executed by this action — it computes a result purely from
// the agent's own stored configuration and logs the run.
export async function runAgentTestAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    sampleMessage: formData.get("sampleMessage"),
    testLanguage: formData.get("testLanguage"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.test", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const [{ data: languages }, { data: capabilities }, { data: handoff }] = await Promise.all([
    supabase.from("ai_agent_languages").select("language_code").eq("agent_id", parsed.agentId).eq("enabled", true),
    supabase
      .from("ai_agent_capabilities")
      .select("capability_key, enabled, approval_required")
      .eq("agent_id", parsed.agentId),
    supabase
      .from("ai_agent_handoff_rules")
      .select("handoff_enabled, condition_guest_requests_human, condition_unsupported_language, condition_emergency, condition_high_risk")
      .eq("agent_id", parsed.agentId)
      .single(),
  ]);

  if (!handoff) {
    throw new Error("Failed to load handoff rules for simulation");
  }

  const simulation = simulateAgentTest({
    sampleMessage: parsed.sampleMessage,
    testLanguage: parsed.testLanguage,
    operatingMode: agent.operating_mode,
    knowledgeBaseEnabled: agent.knowledge_base_enabled,
    enabledLanguageCodes: (languages ?? []).map((l) => l.language_code),
    capabilities: capabilities ?? [],
    handoff,
  });

  const { error: insertError } = await supabase.from("ai_agent_test_sessions").insert({
    agent_id: parsed.agentId,
    tested_by: user.id,
    sample_message: parsed.sampleMessage,
    test_language: parsed.testLanguage,
    simulated_result: simulation,
  });
  if (insertError) {
    throw new Error(`Failed to record test session: ${insertError.message}`);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.tested",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { testLanguage: parsed.testLanguage },
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}/test`);
}
