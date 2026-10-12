// Handoff decision heuristic for a simulated call. Deliberately mirrors the
// shape (and keyword-heuristic approach) of the main app's
// lib/agentTestSimulation.ts rather than importing it — this service is kept
// fully independent of the Next.js app's source tree (see README.md "Why a
// separate service"), so the logic is duplicated in miniature here, scoped to
// only what a call needs to decide: does this simulated conversation require
// human handoff, and why. This is NOT real intent detection.

export interface HandoffRuleFlags {
  handoff_enabled: boolean;
  condition_guest_requests_human: boolean;
  condition_unsupported_language: boolean;
  condition_emergency: boolean;
}

export interface CallDecisionInput {
  sampleMessage: string;
  testLanguage: string;
  enabledLanguageCodes: string[];
  handoff: HandoffRuleFlags;
}

export interface CallDecisionResult {
  disposition: "handled_by_ai" | "handoff_required";
  handoffReason: string | null;
}

const HUMAN_REQUEST_KEYWORDS = ["human", "speak to someone", "real person", "agent please"];
const EMERGENCY_KEYWORDS = ["emergency", "urgent", "help me now", "fire", "injured"];

export function decideCallOutcome(input: CallDecisionInput): CallDecisionResult {
  const message = input.sampleMessage.toLowerCase();
  const languageSupported = input.enabledLanguageCodes.includes(input.testLanguage);

  if (!input.handoff.handoff_enabled) {
    return { disposition: "handled_by_ai", handoffReason: null };
  }

  if (input.handoff.condition_unsupported_language && !languageSupported) {
    return { disposition: "handoff_required", handoffReason: "Unsupported language for this agent." };
  }
  if (input.handoff.condition_emergency && EMERGENCY_KEYWORDS.some((kw) => message.includes(kw))) {
    return { disposition: "handoff_required", handoffReason: "Message appears emergency/sensitive." };
  }
  if (input.handoff.condition_guest_requests_human && HUMAN_REQUEST_KEYWORDS.some((kw) => message.includes(kw))) {
    return { disposition: "handoff_required", handoffReason: "Guest appears to be asking for a human." };
  }

  return { disposition: "handled_by_ai", handoffReason: null };
}
