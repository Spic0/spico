import { supabaseAdmin } from "./supabaseAdmin.js";
import { env, telnyxLive, openaiLive, publicRealtimeStreamUrl } from "./env.js";
import { getTelnyxAdapter } from "./telnyxAdapter.js";
import { getRealtimeAdapter } from "./realtimeAdapter.js";
import { decideCallOutcome } from "./decision.js";
import {
  resolveAgentContext,
  buildRealtimeInstructions,
  VoiceConfigError,
  type AgentCallContext,
} from "./agentContext.js";
import { createCall, appendEvents, appendEvent, updateCall, type CallEventInput } from "./callStore.js";
import { registerCall, getCall, removeCall } from "./callRegistry.js";
import { runFallback } from "./fallback.js";

// =============================================================================
// LIVE inbound call handling (M15) — driven by verified Telnyx webhooks.
// =============================================================================

interface TelnyxEventPayload {
  call_control_id?: string;
  from?: string;
  to?: string;
  direction?: string;
  state?: string;
}

// Map the dialed number → a hotel via hotel_voice_settings.phone_number.
async function resolveHotelIdByDialedNumber(toNumber: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("hotel_voice_settings")
    .select("hotel_id, enabled")
    .eq("phone_number", toNumber)
    .eq("enabled", true)
    .maybeSingle();
  return data?.hotel_id ?? null;
}

// Entry point for a verified Telnyx webhook event. Returns a short note for the
// HTTP ack (Telnyx only needs a 200). Unknown events are acknowledged and
// ignored. Any error here still returns 200 to Telnyx (we don't want retries
// storming the endpoint) but is logged as a call_event when possible.
export async function handleTelnyxEvent(eventType: string, payload: TelnyxEventPayload): Promise<string> {
  const callControlId = payload.call_control_id;
  if (!callControlId) return `ignored ${eventType}: no call_control_id`;

  switch (eventType) {
    case "call.initiated":
      if ((payload.direction ?? "incoming") !== "incoming") return `ignored ${eventType}: not inbound`;
      return handleInbound(callControlId, payload);
    case "call.answered":
      return handleAnswered(callControlId);
    case "call.hangup":
      return handleHangup(callControlId);
    default:
      return `ack ${eventType}`;
  }
}

async function handleInbound(callControlId: string, payload: TelnyxEventPayload): Promise<string> {
  const telnyx = getTelnyxAdapter();
  const toNumber = payload.to ?? "";
  const fromNumber = payload.from ?? null;

  const hotelId = toNumber ? await resolveHotelIdByDialedNumber(toNumber) : null;
  if (!hotelId) {
    // No hotel for this number — answer and fallback so the caller isn't stuck.
    await telnyx.answer({ callControlId, toNumber, fromNumber: fromNumber ?? undefined });
    await runFallback({ telnyx, ctx: { callControlId, toNumber }, reason: `No hotel mapped to ${toNumber}` });
    return "no hotel mapped; fallback routed";
  }

  let ctx: AgentCallContext;
  try {
    ctx = await resolveAgentContext({ hotelId });
  } catch (err) {
    // Voice/agent misconfigured → still answer + fallback, and record a call.
    await telnyx.answer({ callControlId, toNumber, fromNumber: fromNumber ?? undefined });
    const reason = err instanceof VoiceConfigError ? err.message : `Config error: ${(err as Error).message}`;
    await runFallback({ telnyx, ctx: { callControlId, toNumber }, reason });
    return `config error; fallback routed: ${reason}`;
  }

  const callId = await createCall({
    organization_id: ctx.hotel.organization_id,
    hotel_id: ctx.hotel.id,
    ai_agent_id: ctx.agent.id,
    direction: "inbound",
    from_number: fromNumber,
    to_number: toNumber,
    provider: telnyxLive ? "telnyx" : "stub",
    status: "ringing",
  });
  registerCall(callControlId, { callId, ctx, fromNumber, toNumber });
  await appendEvents(callId, [
    { event_type: "call.received", payload: { from: fromNumber, to: toNumber, call_control_id: callControlId } },
  ]);

  // If OpenAI isn't configured we can't run the AI conversation — answer and
  // fallback route rather than opening a dead media stream.
  if (!openaiLive) {
    await telnyx.answer({ callControlId, toNumber, fromNumber: fromNumber ?? undefined });
    const fb = await runFallback({
      telnyx,
      ctx: { callControlId, toNumber },
      reason: "OpenAI Realtime not configured",
      language: ctx.agent.default_language,
    });
    await updateCall(callId, { status: "completed", disposition: "handoff_required", ended_at: new Date().toISOString() });
    await appendEvent(callId, { event_type: "call.fallback", payload: { action: fb.action, notes: fb.notes } });
    return "answered; openai not configured; fallback routed";
  }

  // Answer; media streaming is started once Telnyx reports the call answered.
  const ans = await telnyx.answer({ callControlId, toNumber, fromNumber: fromNumber ?? undefined });
  await appendEvent(callId, { event_type: "call.answered", payload: { note: ans.note } });
  return "answered; awaiting call.answered to start media stream";
}

async function handleAnswered(callControlId: string): Promise<string> {
  const active = getCall(callControlId);
  if (!active) return "answered: no active call registered (ignored)";
  const telnyx = getTelnyxAdapter();

  const base = publicRealtimeStreamUrl();
  if (!base) {
    await runFallback({
      telnyx,
      ctx: { callControlId, toNumber: active.toNumber ?? undefined },
      reason: "PUBLIC_BASE_URL not configured — cannot start media stream",
      language: active.ctx.agent.default_language,
    });
    await updateCall(active.callId, { status: "completed", disposition: "handoff_required", ended_at: new Date().toISOString() });
    return "no public url; fallback routed";
  }

  // Correlate the upcoming media WS connection to this call.
  const streamUrl = `${base}?call_control_id=${encodeURIComponent(callControlId)}`;
  const s = await telnyx.startStreaming({ callControlId, toNumber: active.toNumber ?? undefined }, streamUrl);
  await updateCall(active.callId, { status: "in_progress", answered_at: new Date().toISOString() });
  await appendEvent(active.callId, { event_type: "call.streaming_start", payload: { note: s.note, stream_url: streamUrl } });
  return "streaming started";
}

async function handleHangup(callControlId: string): Promise<string> {
  const active = getCall(callControlId);
  if (!active) return "hangup: no active call registered (ignored)";
  const now = new Date();
  await updateCall(active.callId, { status: "completed", ended_at: now.toISOString() });
  await appendEvent(active.callId, { event_type: "call.completed", payload: {} });
  removeCall(callControlId);
  return "call finalized";
}

// =============================================================================
// SIMULATE path (unchanged capability from M8) — refactored onto the shared
// modules. Still the only path that runs with zero credentials, and still the
// easiest way to exercise the M3 → M15 config wiring + the Calls dashboard.
// =============================================================================

export interface SimulateCallInput {
  hotelSlug: string;
  fromNumber: string;
  sampleMessage: string;
  testLanguage: string;
}

export interface SimulateCallResult {
  callId: string;
  disposition: "handled_by_ai" | "handoff_required";
  handoffReason: string | null;
  replyText: string;
  providerMode: { telnyx: string; openai: string };
  notes: string[];
}

export async function simulateInboundCall(input: SimulateCallInput): Promise<SimulateCallResult> {
  let ctx: AgentCallContext;
  try {
    ctx = await resolveAgentContext({ hotelSlug: input.hotelSlug });
  } catch (err) {
    throw new Error(err instanceof VoiceConfigError ? err.message : (err as Error).message);
  }

  const decision = decideCallOutcome({
    sampleMessage: input.sampleMessage,
    testLanguage: input.testLanguage,
    enabledLanguageCodes: ctx.enabledLanguageCodes,
    handoff: ctx.handoff,
  });

  const telnyx = getTelnyxAdapter();
  const realtime = getRealtimeAdapter();
  const callControlId = `sim-${Date.now()}`;
  const notes: string[] = [];

  const answerResult = await telnyx.answer({
    callControlId,
    fromNumber: input.fromNumber,
    toNumber: ctx.voiceSettings.phone_number ?? undefined,
  });
  notes.push(answerResult.note);

  let replyText: string;
  try {
    const conversation = await realtime.converse({
      agentName: ctx.agent.name,
      instructions: buildRealtimeInstructions(ctx),
      greetingMessage: ctx.agent.greeting_message,
      sampleGuestMessage: input.sampleMessage,
    });
    replyText = conversation.replyText;
    notes.push(conversation.note);
  } catch (err) {
    replyText = ctx.agent.fallback_message ?? "(model error)";
    notes.push(`realtime converse failed: ${(err as Error).message}`);
  }

  if (decision.disposition === "handoff_required") {
    const transferResult = await telnyx.transferToHuman(
      { callControlId, fromNumber: input.fromNumber, toNumber: ctx.voiceSettings.phone_number ?? undefined },
      env.VOICE_FALLBACK_NUMBER ?? "reception",
    );
    notes.push(transferResult.note);
  }

  const now = new Date();
  const callId = await createCall({
    organization_id: ctx.hotel.organization_id,
    hotel_id: ctx.hotel.id,
    ai_agent_id: ctx.agent.id,
    direction: "inbound",
    from_number: input.fromNumber,
    to_number: ctx.voiceSettings.phone_number,
    provider: telnyx.live ? "telnyx" : "stub",
    status: "completed",
  });
  await updateCall(callId, {
    disposition: decision.disposition,
    handoff_reason: decision.handoffReason,
    answered_at: now.toISOString(),
    ended_at: now.toISOString(),
    duration_seconds: 12,
  });

  const events: CallEventInput[] = [
    { event_type: "call.received", payload: { simulated: true, from: input.fromNumber } },
    { event_type: "call.answered", payload: { note: answerResult.note } },
    { event_type: "call.agent_selected", payload: { agent_id: ctx.agent.id, agent_name: ctx.agent.name } },
  ];
  if (decision.disposition === "handoff_required") {
    events.push({ event_type: "call.handoff_triggered", payload: { reason: decision.handoffReason } });
  }
  events.push({ event_type: "call.completed", payload: { reply_text: replyText } });
  await appendEvents(callId, events);

  return {
    callId,
    disposition: decision.disposition,
    handoffReason: decision.handoffReason,
    replyText,
    providerMode: { telnyx: telnyx.live ? "live" : "stub", openai: realtime.live ? "live" : "stub" },
    notes,
  };
}
