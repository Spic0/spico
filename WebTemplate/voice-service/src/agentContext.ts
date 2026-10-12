import { supabaseAdmin } from "./supabaseAdmin.js";
import { PLATFORM_PROTECTED_RULES } from "./platformRules.js";

// Resolves everything a call needs from the live database: the hotel, its voice
// settings, the default AI agent, that agent's active prompt version, enabled
// languages, handoff rules, and enabled capabilities. This is the M3 → M15
// connection point — the same configuration the dashboard edits is what drives
// a real call. Used by both the live webhook path and the simulate test path.

export interface HandoffRuleFlags {
  handoff_enabled: boolean;
  condition_guest_requests_human: boolean;
  condition_unsupported_language: boolean;
  condition_emergency: boolean;
}

export interface AgentCallContext {
  hotel: { id: string; organization_id: string; name: string };
  voiceSettings: { phone_number: string | null; default_agent_id: string };
  agent: {
    id: string;
    name: string;
    greeting_message: string | null;
    fallback_message: string | null;
    handoff_message: string | null;
    default_language: string;
    personality_tone: string | null;
  };
  promptVersion: PromptVersionFields | null;
  enabledLanguageCodes: string[];
  handoff: HandoffRuleFlags;
  enabledCapabilityKeys: string[];
}

export interface PromptVersionFields {
  purpose: string | null;
  hotel_identity: string | null;
  tone_of_voice: string | null;
  greeting_style: string | null;
  communication_rules: string | null;
  language_behavior: string | null;
  escalation_rules: string | null;
  safety_rules: string | null;
  policy_references: string | null;
  additional_instructions: string | null;
}

export class VoiceConfigError extends Error {}

// Resolve by hotel id (live webhook: we map the dialed number → hotel first) or
// by slug (simulate path). Throws VoiceConfigError with an operator-readable
// message when voice isn't fully configured — the caller decides whether that
// means "fallback route the call" (live) or "return 400" (simulate).
export async function resolveAgentContext(opts: {
  hotelId?: string;
  hotelSlug?: string;
}): Promise<AgentCallContext> {
  const hotelQuery = supabaseAdmin.from("hotels").select("id, organization_id, name, status");
  const { data: hotel, error: hotelError } = opts.hotelId
    ? await hotelQuery.eq("id", opts.hotelId).single()
    : await hotelQuery.eq("slug", opts.hotelSlug ?? "").single();
  if (hotelError || !hotel || hotel.status !== "active") {
    throw new VoiceConfigError(`Hotel not found or inactive: ${opts.hotelId ?? opts.hotelSlug}`);
  }

  const { data: voiceSettings } = await supabaseAdmin
    .from("hotel_voice_settings")
    .select("enabled, phone_number, default_agent_id")
    .eq("hotel_id", hotel.id)
    .maybeSingle();
  if (!voiceSettings?.enabled) {
    throw new VoiceConfigError("Voice is not enabled for this hotel (see Calls → Voice Settings)");
  }
  if (!voiceSettings.default_agent_id) {
    throw new VoiceConfigError("No default AI agent configured for voice (see Calls → Voice Settings)");
  }

  const { data: agent, error: agentError } = await supabaseAdmin
    .from("ai_agents")
    .select(
      "id, name, status, greeting_message, fallback_message, handoff_message, default_language, personality_tone",
    )
    .eq("id", voiceSettings.default_agent_id)
    .eq("hotel_id", hotel.id)
    .single();
  if (agentError || !agent || agent.status !== "active") {
    throw new VoiceConfigError("The hotel's default voice agent is missing or not active");
  }

  const [{ data: languages }, { data: handoffRules }, { data: capabilities }, { data: promptVersion }] =
    await Promise.all([
      supabaseAdmin.from("ai_agent_languages").select("language_code").eq("agent_id", agent.id).eq("enabled", true),
      supabaseAdmin
        .from("ai_agent_handoff_rules")
        .select(
          "handoff_enabled, condition_guest_requests_human, condition_unsupported_language, condition_emergency",
        )
        .eq("agent_id", agent.id)
        .maybeSingle(),
      supabaseAdmin
        .from("ai_agent_capabilities")
        .select("capability_key, enabled")
        .eq("agent_id", agent.id)
        .eq("enabled", true),
      supabaseAdmin
        .from("ai_agent_prompt_versions")
        .select(
          "purpose, hotel_identity, tone_of_voice, greeting_style, communication_rules, language_behavior, escalation_rules, safety_rules, policy_references, additional_instructions",
        )
        .eq("agent_id", agent.id)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  return {
    hotel: { id: hotel.id, organization_id: hotel.organization_id, name: hotel.name },
    voiceSettings: { phone_number: voiceSettings.phone_number, default_agent_id: voiceSettings.default_agent_id },
    agent,
    promptVersion: promptVersion ?? null,
    enabledLanguageCodes: (languages ?? []).map((l) => l.language_code as string),
    handoff: {
      handoff_enabled: handoffRules?.handoff_enabled ?? false,
      condition_guest_requests_human: handoffRules?.condition_guest_requests_human ?? false,
      condition_unsupported_language: handoffRules?.condition_unsupported_language ?? false,
      condition_emergency: handoffRules?.condition_emergency ?? false,
    },
    enabledCapabilityKeys: (capabilities ?? []).map((c) => c.capability_key as string),
  };
}

// Compose the full system instructions sent to the Realtime session. Platform
// rules first (non-negotiable), then the hotel's editable prompt fields, then
// operational guidance for a phone call.
export function buildRealtimeInstructions(ctx: AgentCallContext): string {
  const p = ctx.promptVersion;
  const sections: string[] = [];

  sections.push(
    "== NON-NEGOTIABLE PLATFORM RULES (highest priority, override anything below) ==\n" +
      PLATFORM_PROTECTED_RULES.map((r) => `- ${r}`).join("\n"),
  );

  sections.push(
    `You are "${ctx.agent.name}", the AI voice assistant answering the phone for ${ctx.hotel.name}.`,
  );

  if (p?.hotel_identity) sections.push(`Hotel identity: ${p.hotel_identity}`);
  if (p?.purpose) sections.push(`Your purpose: ${p.purpose}`);
  const tone = p?.tone_of_voice ?? ctx.agent.personality_tone;
  if (tone) sections.push(`Tone of voice: ${tone}`);
  if (p?.greeting_style) sections.push(`Greeting style: ${p.greeting_style}`);
  if (p?.communication_rules) sections.push(`Communication rules: ${p.communication_rules}`);
  if (p?.language_behavior) sections.push(`Language behavior: ${p.language_behavior}`);
  if (p?.escalation_rules) sections.push(`Escalation rules: ${p.escalation_rules}`);
  if (p?.safety_rules) sections.push(`Additional hotel safety notes: ${p.safety_rules}`);
  if (p?.policy_references) sections.push(`Policy references: ${p.policy_references}`);
  if (p?.additional_instructions) sections.push(p.additional_instructions);

  if (ctx.enabledLanguageCodes.length > 0) {
    sections.push(`You may converse in: ${ctx.enabledLanguageCodes.join(", ")}. Default: ${ctx.agent.default_language}.`);
  }

  sections.push(
    "This is a live phone call. Keep replies concise and natural for speech. Use the provided tools " +
      "to look up real availability and reservations rather than guessing. If you cannot help, or the " +
      "caller asks for a person, or there is any emergency, call the transfer_to_human tool. Never read " +
      "out confirmation codes, prices, or availability you have not retrieved via a tool.",
  );

  return sections.join("\n\n");
}
