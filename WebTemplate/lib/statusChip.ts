// Single source of truth mapping every domain status string to a status-chip
// variant + human label (Phase 2, see docs/ui-audit.md). Used by
// components/ui/StatusChip.tsx so reservation/membership/hotel/call/etc.
// statuses colour identically everywhere, replacing ad-hoc plain-text status.

export type ChipVariant = "success" | "warning" | "danger" | "info" | "neutral";

// Status values collide very little across domains, and where they do (e.g.
// "active", "pending") the intended colour is the same, so one flat map is
// sufficient and keeps call sites trivial (<StatusChip status={row.status} />).
const STATUS_VARIANTS: Record<string, ChipVariant> = {
  // lifecycle / generic
  active: "success",
  inactive: "neutral",
  archived: "neutral",
  draft: "warning",
  published: "success",
  suspended: "danger",
  onboarding: "warning",

  // memberships / invitations
  invited: "warning",
  revoked: "neutral",
  accepted: "success",
  expired: "neutral",

  // reservations
  pending: "warning",
  confirmed: "info",
  checked_in: "success",
  checked_out: "neutral",
  cancelled: "danger",
  no_show: "danger",

  // calls (status + disposition)
  ringing: "info",
  in_progress: "info",
  completed: "success",
  failed: "danger",
  no_answer: "neutral",
  handled_by_ai: "success",
  handoff_required: "warning",
  handoff_completed: "success",
  voicemail: "neutral",
  missed: "danger",

  // housekeeping tasks + room housekeeping_status
  verified: "success",
  clean: "success",
  dirty: "warning",
  inspected: "info",
  out_of_service: "danger",

  // KB document processing_status
  ready: "success",
  processing: "info",

  // priority (conversations, housekeeping)
  low: "info",
  normal: "neutral",
  high: "danger",

  // folio / conversations
  open: "info",
  closed: "neutral",
  snoozed: "neutral",

  // webhook deliveries
  delivered: "success",
  sent: "info",
  queued: "neutral",

  // moderation flags
  resolved: "success",

  // subscriptions
  trialing: "info",
  past_due: "warning",
  canceled: "danger",

  // integrations / connectors
  not_connected: "neutral",
  configured: "success",
};

export function statusChipVariant(status: string): ChipVariant {
  return STATUS_VARIANTS[status] ?? "neutral";
}

export function humanizeStatus(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
