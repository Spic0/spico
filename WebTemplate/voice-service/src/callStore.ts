import { supabaseAdmin } from "./supabaseAdmin.js";

// Thin DB helpers over the `calls` / `call_events` tables, shared by the live
// webhook path and the simulate test path. Service-role writes, always scoped
// by hotel_id/organization_id that the caller supplies.

export interface CreateCallInput {
  organization_id: string;
  hotel_id: string;
  ai_agent_id: string | null;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  provider: string;
  status?: "ringing" | "in_progress" | "completed" | "failed" | "no_answer";
}

export interface CallEventInput {
  event_type: string;
  payload?: Record<string, unknown>;
}

export async function createCall(input: CreateCallInput): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("calls")
    .insert({
      organization_id: input.organization_id,
      hotel_id: input.hotel_id,
      ai_agent_id: input.ai_agent_id,
      direction: input.direction,
      from_number: input.from_number,
      to_number: input.to_number,
      provider: input.provider,
      status: input.status ?? "ringing",
      started_at: now,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create call record: ${error?.message ?? "unknown"}`);
  return data.id;
}

export async function appendEvents(callId: string, events: CallEventInput[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await supabaseAdmin
    .from("call_events")
    .insert(events.map((e) => ({ call_id: callId, event_type: e.event_type, payload: e.payload ?? {} })));
  if (error) throw new Error(`Failed to write call_events: ${error.message}`);
}

export async function appendEvent(callId: string, event: CallEventInput): Promise<void> {
  await appendEvents(callId, [event]);
}

export interface UpdateCallPatch {
  status?: "ringing" | "in_progress" | "completed" | "failed" | "no_answer";
  disposition?: "handled_by_ai" | "handoff_required" | "handoff_completed" | "voicemail" | "missed";
  handoff_reason?: string | null;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  notes?: string;
}

export async function updateCall(callId: string, patch: UpdateCallPatch): Promise<void> {
  const { error } = await supabaseAdmin.from("calls").update(patch).eq("id", callId);
  if (error) throw new Error(`Failed to update call ${callId}: ${error.message}`);
}
