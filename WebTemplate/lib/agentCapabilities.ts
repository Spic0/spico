// The reusable AI agent capability registry. Definitions (display name,
// description, default risk, default approval requirement, future tool id)
// live here in code — used by every capability-related UI and validation
// path instead of being hardcoded per-page. Per-agent state (enabled,
// approval override) lives in ai_agent_capabilities; keep the
// `capability_key` values here in sync with that table's CHECK constraint
// (supabase/migrations/20260725110003_ai_agent_capabilities.sql).
//
// M3 is configuration only: enabling a capability here does not execute
// anything — no reservation, message, or external tool call exists yet.

export type CapabilityKey =
  | "general_hotel_information"
  | "hotel_policies"
  | "check_in_out_information"
  | "parking_information"
  | "breakfast_information"
  | "restaurant_information"
  | "spa_information"
  | "transfer_information"
  | "location_and_directions"
  | "availability_inquiry"
  | "booking_request_creation"
  | "reservation_lookup_request"
  | "reservation_modification_request"
  | "reservation_cancellation_request"
  | "reception_task_creation"
  | "guest_note_creation"
  | "human_handoff"
  | "conversation_summary"
  | "emergency_escalation";

export type RiskLevel = "low" | "medium" | "high";

export interface CapabilityDefinition {
  key: CapabilityKey;
  displayName: string;
  description: string;
  defaultRiskLevel: RiskLevel;
  defaultApprovalRequired: boolean;
  /** Protected capabilities can never be disabled — see the DB CHECK constraint. */
  protected: boolean;
  /** Placeholder for the tool this capability will eventually invoke. Not used yet. */
  futureToolIdentifier: string | null;
}

export const CAPABILITY_REGISTRY: CapabilityDefinition[] = [
  {
    key: "general_hotel_information",
    displayName: "General hotel information",
    description: "Answer general questions about the hotel.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "hotel_policies",
    displayName: "Hotel policies",
    description: "Explain hotel policies (pets, smoking, children, etc).",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "check_in_out_information",
    displayName: "Check-in / check-out information",
    description: "Share check-in and check-out times and procedures.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "parking_information",
    displayName: "Parking information",
    description: "Share parking availability and instructions.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "breakfast_information",
    displayName: "Breakfast information",
    description: "Share breakfast hours and details.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "restaurant_information",
    displayName: "Restaurant information",
    description: "Share on-site restaurant details.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "spa_information",
    displayName: "Spa information",
    description: "Share spa hours and service details.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "transfer_information",
    displayName: "Transfer information",
    description: "Share airport/station transfer options.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "location_and_directions",
    displayName: "Location and directions",
    description: "Share the hotel's location and directions.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "availability_inquiry",
    displayName: "Availability inquiry",
    description: "Look up room availability for given dates.",
    defaultRiskLevel: "medium",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: "pms.availability.lookup",
  },
  {
    key: "booking_request_creation",
    displayName: "Booking request creation",
    description: "Create a new booking request.",
    defaultRiskLevel: "high",
    defaultApprovalRequired: true,
    protected: false,
    futureToolIdentifier: "pms.booking.create",
  },
  {
    key: "reservation_lookup_request",
    displayName: "Reservation lookup request",
    description: "Look up an existing reservation.",
    defaultRiskLevel: "medium",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: "pms.reservation.lookup",
  },
  {
    key: "reservation_modification_request",
    displayName: "Reservation modification request",
    description: "Request a change to an existing reservation.",
    defaultRiskLevel: "high",
    defaultApprovalRequired: true,
    protected: false,
    futureToolIdentifier: "pms.reservation.modify",
  },
  {
    key: "reservation_cancellation_request",
    displayName: "Reservation cancellation request",
    description: "Request cancellation of an existing reservation.",
    defaultRiskLevel: "high",
    defaultApprovalRequired: true,
    protected: false,
    futureToolIdentifier: "pms.reservation.cancel",
  },
  {
    key: "reception_task_creation",
    displayName: "Reception task creation",
    description: "Create a task for the reception team.",
    defaultRiskLevel: "medium",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: "ops.task.create",
  },
  {
    key: "guest_note_creation",
    displayName: "Guest note creation",
    description: "Add a note to a guest's profile.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: "guests.note.create",
  },
  {
    key: "human_handoff",
    displayName: "Human handoff",
    description: "Transfer the conversation to a human team member.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: true,
    futureToolIdentifier: null,
  },
  {
    key: "conversation_summary",
    displayName: "Conversation summary",
    description: "Summarize the conversation for handoff or records.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: false,
    futureToolIdentifier: null,
  },
  {
    key: "emergency_escalation",
    displayName: "Emergency escalation",
    description: "Escalate an emergency or safety-sensitive request immediately.",
    defaultRiskLevel: "low",
    defaultApprovalRequired: false,
    protected: true,
    futureToolIdentifier: null,
  },
];

export function findCapability(key: string): CapabilityDefinition | undefined {
  return CAPABILITY_REGISTRY.find((c) => c.key === key);
}

export const CAPABILITY_KEYS = CAPABILITY_REGISTRY.map((c) => c.key);
