// Voice shared definitions (Milestone 8). Enum value sets + labels used by the
// internal Calls/Voice pages. Registry-in-code pattern, consistent with
// lib/inboxChannels.ts / lib/pms.ts. Keep the value sets in sync with the
// CHECK constraints in supabase/migrations/2026073016000*.sql.
//
// M8 is a foundation: the only thing that ever writes a `calls` row is the
// voice-service's "simulate inbound call" test path (see
// voice-service/README.md). No live Telnyx/OpenAI Realtime connection exists.

export type CallDirection = "inbound" | "outbound";
export type CallStatus = "ringing" | "in_progress" | "completed" | "failed" | "no_answer";
export type CallDisposition = "handled_by_ai" | "handoff_required" | "handoff_completed" | "voicemail" | "missed";
export type CallEventType =
  | "call.received"
  | "call.answered"
  | "call.agent_selected"
  | "call.handoff_triggered"
  | "call.handoff_completed"
  | "call.completed"
  | "call.failed"
  | "call.note";

export const CALL_STATUSES: { value: CallStatus; label: string }[] = [
  { value: "ringing", label: "Ringing" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "no_answer", label: "No answer" },
];

export const CALL_DISPOSITIONS: { value: CallDisposition; label: string }[] = [
  { value: "handled_by_ai", label: "Handled by AI" },
  { value: "handoff_required", label: "Handoff required" },
  { value: "handoff_completed", label: "Handoff completed" },
  { value: "voicemail", label: "Voicemail" },
  { value: "missed", label: "Missed" },
];

export function callStatusLabel(status: string): string {
  return CALL_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function callDispositionLabel(disposition: string | null): string {
  if (!disposition) return "—";
  return CALL_DISPOSITIONS.find((d) => d.value === disposition)?.label ?? disposition;
}

export function callEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    "call.received": "Call received",
    "call.answered": "Call answered",
    "call.agent_selected": "Agent selected",
    "call.handoff_triggered": "Handoff triggered",
    "call.handoff_completed": "Handoff completed",
    "call.completed": "Call completed",
    "call.failed": "Call failed",
    "call.note": "Note",
  };
  return labels[eventType] ?? eventType;
}

export function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
