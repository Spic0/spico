import type { AgentCallContext } from "./agentContext.js";

// In-memory map of active live calls, keyed by Telnyx call_control_id. The
// webhook path (call.initiated/answered) populates it; the /realtime WS handler
// looks a call up when Telnyx connects its media stream. This is per-process
// state — adequate for a single-instance MVP. Hardening note (see README): a
// `provider_call_id` column on `calls` would make correlation survive a process
// restart and allow horizontal scaling; not added yet to avoid a schema change.

export interface ActiveCall {
  callId: string;
  ctx: AgentCallContext;
  fromNumber: string | null;
  toNumber: string | null;
}

const activeCalls = new Map<string, ActiveCall>();

export function registerCall(callControlId: string, call: ActiveCall): void {
  activeCalls.set(callControlId, call);
}

export function getCall(callControlId: string): ActiveCall | undefined {
  return activeCalls.get(callControlId);
}

export function removeCall(callControlId: string): void {
  activeCalls.delete(callControlId);
}
