import { WebSocket } from "ws";
import type { WebSocket as WsSocket } from "ws";
import { env } from "./env.js";
import type { AgentCallContext } from "./agentContext.js";
import { buildRealtimeInstructions } from "./agentContext.js";
import { toolsForContext, executeTool } from "./tools.js";
import type { TelnyxAdapter } from "./telnyxAdapter.js";
import { appendEvent, updateCall } from "./callStore.js";
import { runFallback } from "./fallback.js";

// The live audio bridge (M15). Relays a Telnyx bidirectional media stream
// (G.711 μ-law 8kHz) to an OpenAI Realtime session and back, executes agent
// tools the model calls, and performs real human transfer / hangup. Audio
// formats match on both sides (Telnyx PCMU == OpenAI g711_ulaw), so frames pass
// through as base64 with no transcoding.
//
// NOTE: this whole file requires live Telnyx + OpenAI credentials and a public
// deployment to exercise — it cannot be run end-to-end from localhost. Its
// structure is standard and typechecked; see README.md for the activation +
// live-test runbook.

const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime";

export interface BridgeParams {
  telnyxSocket: WsSocket;
  ctx: AgentCallContext;
  telnyx: TelnyxAdapter;
  callId: string;
  callControlId: string;
  fromNumber: string | null;
  toNumber: string | null;
}

export async function startRealtimeBridge(params: BridgeParams): Promise<void> {
  const { telnyxSocket, ctx, telnyx, callId, callControlId } = params;

  if (!env.OPENAI_API_KEY) {
    // Should not happen (server only bridges when openaiLive), but be safe.
    await runFallback({
      telnyx,
      ctx: { callControlId, fromNumber: params.fromNumber ?? undefined, toNumber: params.toNumber ?? undefined },
      reason: "OPENAI_API_KEY not configured",
      language: ctx.agent.default_language,
    });
    telnyxSocket.close();
    return;
  }

  let streamId: string | undefined;
  let closed = false;
  let openaiReady = false;
  const pendingCallerAudio: string[] = []; // μ-law base64 queued until OpenAI is ready

  const openai = new WebSocket(`${OPENAI_REALTIME_URL}?model=${encodeURIComponent(env.OPENAI_REALTIME_MODEL)}`, {
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "OpenAI-Beta": "realtime=v1" },
  });

  const closeAll = (reason: string) => {
    if (closed) return;
    closed = true;
    try {
      openai.close();
    } catch {
      /* noop */
    }
    try {
      telnyxSocket.close();
    } catch {
      /* noop */
    }
    void appendEvent(callId, { event_type: "call.bridge_closed", payload: { reason } }).catch(() => {});
  };

  const sendToTelnyx = (payloadBase64: string) => {
    if (telnyxSocket.readyState !== WebSocket.OPEN) return;
    telnyxSocket.send(JSON.stringify({ event: "media", ...(streamId ? { stream_id: streamId } : {}), media: { payload: payloadBase64 } }));
  };

  // ---- OpenAI Realtime session ----
  openai.on("open", () => {
    openai.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["audio", "text"],
          instructions: buildRealtimeInstructions(ctx),
          voice: env.OPENAI_REALTIME_VOICE,
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          turn_detection: { type: "server_vad" },
          tools: toolsForContext(ctx),
          tool_choice: "auto",
        },
      }),
    );
    // Prompt an opening greeting in the caller's language.
    const greeting = ctx.agent.greeting_message ?? `Greet the caller warmly as ${ctx.agent.name} for ${ctx.hotel.name}.`;
    openai.send(
      JSON.stringify({
        type: "response.create",
        response: { instructions: `Open the call: ${greeting}` },
      }),
    );
    openaiReady = true;
    for (const audio of pendingCallerAudio.splice(0)) {
      openai.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
    }
    void appendEvent(callId, { event_type: "call.realtime_connected", payload: { model: env.OPENAI_REALTIME_MODEL } }).catch(() => {});
  });

  openai.on("message", (raw) => {
    void handleOpenAIMessage(raw.toString());
  });

  openai.on("error", (err) => {
    void appendEvent(callId, { event_type: "call.realtime_error", payload: { message: (err as Error).message } }).catch(() => {});
    void runFallback({
      telnyx,
      ctx: { callControlId, fromNumber: params.fromNumber ?? undefined, toNumber: params.toNumber ?? undefined },
      reason: `OpenAI Realtime error: ${(err as Error).message}`,
      language: ctx.agent.default_language,
    }).finally(() => closeAll("openai_error"));
  });

  openai.on("close", () => closeAll("openai_closed"));

  async function handleOpenAIMessage(text: string): Promise<void> {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    const type = msg.type as string;

    // Model audio out → caller.
    if (type === "response.audio.delta" && typeof msg.delta === "string") {
      sendToTelnyx(msg.delta);
      return;
    }

    // A tool call finished streaming its arguments.
    if (type === "response.function_call_arguments.done") {
      const name = String(msg.name ?? "");
      const callItemId = String(msg.call_id ?? "");
      let args: Record<string, unknown> = {};
      try {
        args = msg.arguments ? (JSON.parse(String(msg.arguments)) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }
      await runTool(name, callItemId, args);
      return;
    }

    if (type === "error") {
      void appendEvent(callId, { event_type: "call.realtime_error", payload: msg }).catch(() => {});
    }
  }

  async function runTool(name: string, callItemId: string, args: Record<string, unknown>): Promise<void> {
    await appendEvent(callId, { event_type: "call.tool_called", payload: { name, args } }).catch(() => {});
    let result;
    try {
      result = await executeTool(name, args, ctx);
    } catch (err) {
      result = { kind: "data" as const, output: { error: (err as Error).message } };
    }

    // Return the tool output to the model so it can speak a natural response.
    const sendOutput = (output: Record<string, unknown>) => {
      openai.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: { type: "function_call_output", call_id: callItemId, output: JSON.stringify(output) },
        }),
      );
    };

    if (result.kind === "transfer") {
      sendOutput(result.output);
      await appendEvent(callId, { event_type: "call.handoff_triggered", payload: { reason: result.reason } }).catch(() => {});
      const destination = env.VOICE_FALLBACK_NUMBER ?? params.toNumber ?? "";
      try {
        if (destination) {
          await telnyx.transferToHuman(
            { callControlId, fromNumber: params.fromNumber ?? undefined, toNumber: params.toNumber ?? undefined },
            destination,
          );
          await updateCall(callId, { disposition: "handoff_completed", handoff_reason: result.reason });
        } else {
          await runFallback({
            telnyx,
            ctx: { callControlId, toNumber: params.toNumber ?? undefined },
            reason: result.reason,
            spokenMessage: ctx.agent.handoff_message ?? undefined,
            language: ctx.agent.default_language,
          });
          await updateCall(callId, { disposition: "handoff_required", handoff_reason: result.reason });
        }
      } finally {
        closeAll("handoff");
      }
      return;
    }

    if (result.kind === "hangup") {
      sendOutput(result.output);
      try {
        await telnyx.hangup({ callControlId });
      } finally {
        closeAll("agent_ended_call");
      }
      return;
    }

    // Plain data: hand back to the model and ask it to continue speaking.
    sendOutput(result.output);
    openai.send(JSON.stringify({ type: "response.create" }));
  }

  // ---- Telnyx media stream (caller audio + lifecycle) ----
  telnyxSocket.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const event = msg.event as string;

    if (event === "start") {
      const start = (msg.start ?? {}) as Record<string, unknown>;
      streamId = (msg.stream_id as string) ?? (start.stream_id as string) ?? undefined;
      void appendEvent(callId, { event_type: "call.media_started", payload: { stream_id: streamId } }).catch(() => {});
      return;
    }

    if (event === "media") {
      const media = (msg.media ?? {}) as Record<string, unknown>;
      const payload = media.payload as string | undefined;
      if (!payload) return;
      if (!openaiReady || openai.readyState !== WebSocket.OPEN) {
        pendingCallerAudio.push(payload);
        return;
      }
      openai.send(JSON.stringify({ type: "input_audio_buffer.append", audio: payload }));
      return;
    }

    if (event === "stop") {
      closeAll("telnyx_stream_stopped");
    }
  });

  telnyxSocket.on("close", () => closeAll("telnyx_socket_closed"));
  telnyxSocket.on("error", () => closeAll("telnyx_socket_error"));

  // Resolve when the call fully ends.
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (closed) {
        clearInterval(check);
        resolve();
      }
    }, 250);
  });
}
