// Pure, deterministic "what would apply" computation for the Test
// Playground. No AI provider, voice system, or messaging system is ever
// called to produce this — it's derived entirely from the agent's own
// stored configuration, plus a simple keyword heuristic (not real intent
// detection) to decide whether the sample message plausibly needs approval
// or handoff.

export interface SimulationCapability {
  capability_key: string;
  enabled: boolean;
  approval_required: boolean | null;
}

export interface SimulationHandoff {
  handoff_enabled: boolean;
  condition_guest_requests_human: boolean;
  condition_unsupported_language: boolean;
  condition_emergency: boolean;
  condition_high_risk: boolean;
}

export interface AgentTestSimulationInput {
  sampleMessage: string;
  testLanguage: string;
  operatingMode: string;
  knowledgeBaseEnabled: boolean;
  enabledLanguageCodes: string[];
  capabilities: SimulationCapability[];
  handoff: SimulationHandoff;
}

export interface AgentTestSimulationResult {
  operatingMode: string;
  languageSupported: boolean;
  enabledCapabilities: string[];
  wouldRequireApproval: boolean;
  approvalReasons: string[];
  handoffWouldApply: boolean;
  handoffReasons: string[];
  knowledgeBaseScope: string;
}

const HIGH_RISK_KEYWORDS: Record<string, string[]> = {
  booking_request_creation: ["book", "booking", "reserve"],
  reservation_modification_request: ["change my reservation", "modify", "move my booking"],
  reservation_cancellation_request: ["cancel"],
};

const HUMAN_REQUEST_KEYWORDS = ["human", "speak to someone", "real person", "agent please"];
const EMERGENCY_KEYWORDS = ["emergency", "urgent", "help me now", "fire", "injured"];

export function simulateAgentTest(input: AgentTestSimulationInput): AgentTestSimulationResult {
  const message = input.sampleMessage.toLowerCase();
  const enabledCapabilities = input.capabilities.filter((c) => c.enabled).map((c) => c.capability_key);
  const languageSupported = input.enabledLanguageCodes.includes(input.testLanguage);

  const approvalReasons: string[] = [];
  if (input.operatingMode === "manual_assist") {
    approvalReasons.push("Manual Assist requires human approval for every action.");
  } else {
    for (const [key, keywords] of Object.entries(HIGH_RISK_KEYWORDS)) {
      const capability = input.capabilities.find((c) => c.capability_key === key);
      if (!capability?.enabled) continue;
      const requiresApproval = capability.approval_required ?? true;
      if (requiresApproval && keywords.some((kw) => message.includes(kw))) {
        approvalReasons.push(`Message matches "${key.replace(/_/g, " ")}", which requires approval.`);
      }
    }
  }

  const handoffReasons: string[] = [];
  if (input.handoff.handoff_enabled) {
    if (input.handoff.condition_unsupported_language && !languageSupported) {
      handoffReasons.push("Unsupported language for this agent.");
    }
    if (input.handoff.condition_guest_requests_human && HUMAN_REQUEST_KEYWORDS.some((kw) => message.includes(kw))) {
      handoffReasons.push("Guest appears to be asking for a human.");
    }
    if (input.handoff.condition_emergency && EMERGENCY_KEYWORDS.some((kw) => message.includes(kw))) {
      handoffReasons.push("Message appears emergency/sensitive.");
    }
  }

  return {
    operatingMode: input.operatingMode,
    languageSupported,
    enabledCapabilities,
    wouldRequireApproval: approvalReasons.length > 0,
    approvalReasons,
    handoffWouldApply: handoffReasons.length > 0,
    handoffReasons,
    knowledgeBaseScope: input.knowledgeBaseEnabled
      ? "This hotel's knowledge base — not built yet, see the Knowledge Base Foundation milestone."
      : "Knowledge base is not enabled for this agent.",
  };
}
