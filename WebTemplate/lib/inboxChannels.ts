// Omnichannel Inbox shared definitions (Milestone 5). Channel type registry,
// enum value sets + labels, and the provider adapter interface. Same
// registry-in-code pattern as lib/agentCapabilities.ts / lib/knowledgeBase.ts.
// Keep the value sets in sync with the CHECK constraints in
// supabase/migrations/2026072713000*.sql.
//
// M5 is a skeleton: every adapter is a stub. NOTHING is transmitted to any
// email/SMS/WhatsApp/Viber/voice provider — outbound messages are recorded as
// "sent" and go nowhere. Live provider adapters arrive in later milestones.

export type ChannelType = "email" | "sms" | "whatsapp" | "viber" | "web_chat" | "voice";
export type ChannelStatus = "active" | "inactive";
export type ConversationStatus = "open" | "pending" | "snoozed" | "closed";
export type ConversationPriority = "low" | "normal" | "high";
export type MessageDirection = "inbound" | "outbound";
export type SenderType = "guest" | "user" | "ai" | "system";
export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export interface ChannelTypeDef {
  type: ChannelType;
  label: string;
  icon: string;
  /** Whether this channel type is wired to anything. Always false in M5. */
  live: boolean;
}

export const CHANNEL_TYPES: ChannelTypeDef[] = [
  { type: "email", label: "Email", icon: "fa-envelope", live: false },
  { type: "sms", label: "SMS", icon: "fa-comment-sms", live: false },
  { type: "whatsapp", label: "WhatsApp", icon: "fa-whatsapp", live: false },
  { type: "viber", label: "Viber", icon: "fa-viber", live: false },
  { type: "web_chat", label: "Web chat", icon: "fa-comments", live: false },
  { type: "voice", label: "Voice", icon: "fa-phone", live: false },
];

export function channelTypeLabel(type: string): string {
  return CHANNEL_TYPES.find((c) => c.type === type)?.label ?? type;
}

export function channelTypeIcon(type: string): string {
  return CHANNEL_TYPES.find((c) => c.type === type)?.icon ?? "fa-inbox";
}

export const CONVERSATION_STATUSES: { value: ConversationStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "snoozed", label: "Snoozed" },
  { value: "closed", label: "Closed" },
];

export const CONVERSATION_PRIORITIES: { value: ConversationPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

export function conversationStatusLabel(status: string): string {
  return CONVERSATION_STATUSES.find((s) => s.value === status)?.label ?? status;
}

// ---- Provider adapters (all stubs in M5) --------------------------------

export interface OutboundMessage {
  channelType: ChannelType;
  to: string | null;
  body: string;
}

export interface SendResult {
  deliveryStatus: DeliveryStatus;
  externalMessageId: string | null;
  note: string;
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  /**
   * Stub: records intent only. A real adapter would call the provider API here.
   * Returns "sent" with no external id and a note making the no-op explicit.
   */
  send(message: OutboundMessage): Promise<SendResult>;
}

class StubChannelAdapter implements ChannelAdapter {
  constructor(readonly type: ChannelType) {}

  async send(_message: OutboundMessage): Promise<SendResult> {
    return {
      deliveryStatus: "sent",
      externalMessageId: null,
      note: `stub adapter for ${this.type} — message stored, not transmitted (no provider connected in M5)`,
    };
  }
}

// Every channel type resolves to a stub in M5. Swapping in a live adapter later
// is a change here, not across the call sites that use getChannelAdapter().
export function getChannelAdapter(type: ChannelType): ChannelAdapter {
  return new StubChannelAdapter(type);
}
