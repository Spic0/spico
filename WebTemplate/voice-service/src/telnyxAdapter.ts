import { env, telnyxLive } from "./env.js";

// Telnyx Call Control adapter. The StubTelnyxAdapter (unchanged from M8) logs
// what it *would* do and makes no network call; the RealTelnyxAdapter (M15)
// makes real Call Control v2 REST requests. getTelnyxAdapter() returns the real
// one only when TELNYX_API_KEY + TELNYX_PUBLIC_KEY are both present, otherwise
// the stub — so nothing here ever hits the network without credentials.
//
// Call Control v2 command shape:
//   POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/{action}
//   Authorization: Bearer <TELNYX_API_KEY>

export interface TelnyxCallContext {
  callControlId: string;
  fromNumber?: string;
  toNumber?: string;
}

export interface TelnyxAdapter {
  readonly live: boolean;
  answer(ctx: TelnyxCallContext): Promise<{ note: string }>;
  hangup(ctx: TelnyxCallContext): Promise<{ note: string }>;
  transferToHuman(ctx: TelnyxCallContext, destination: string): Promise<{ note: string }>;
  // Start bidirectional media streaming to our /realtime WS (G.711 μ-law 8kHz,
  // which matches OpenAI Realtime's g711_ulaw format — no resampling).
  startStreaming(ctx: TelnyxCallContext, streamUrl: string): Promise<{ note: string }>;
  // Speak a message to the caller via Telnyx TTS (used for fallback prompts).
  speak(ctx: TelnyxCallContext, text: string, opts?: { voice?: string; language?: string }): Promise<{ note: string }>;
}

const TELNYX_API_BASE = "https://api.telnyx.com/v2";

class StubTelnyxAdapter implements TelnyxAdapter {
  readonly live = false;
  async answer(ctx: TelnyxCallContext) {
    return { note: `stub: would answer call_control_id=${ctx.callControlId} — no live Telnyx API call made` };
  }
  async hangup(ctx: TelnyxCallContext) {
    return { note: `stub: would hang up call_control_id=${ctx.callControlId} — no live Telnyx API call made` };
  }
  async transferToHuman(ctx: TelnyxCallContext, destination: string) {
    return {
      note: `stub: would transfer call_control_id=${ctx.callControlId} to ${destination} — no live Telnyx API call made`,
    };
  }
  async startStreaming(ctx: TelnyxCallContext, streamUrl: string) {
    return { note: `stub: would start media streaming call_control_id=${ctx.callControlId} -> ${streamUrl}` };
  }
  async speak(ctx: TelnyxCallContext, text: string) {
    return { note: `stub: would speak "${text.slice(0, 40)}…" on call_control_id=${ctx.callControlId}` };
  }
}

class RealTelnyxAdapter implements TelnyxAdapter {
  readonly live = true;
  constructor(private readonly apiKey: string) {}

  private async command(callControlId: string, action: string, body: Record<string, unknown>) {
    const res = await fetch(`${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Telnyx ${action} failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    return res.json().catch(() => ({}));
  }

  async answer(ctx: TelnyxCallContext) {
    await this.command(ctx.callControlId, "answer", {});
    return { note: `telnyx: answered call_control_id=${ctx.callControlId}` };
  }

  async hangup(ctx: TelnyxCallContext) {
    await this.command(ctx.callControlId, "hangup", {});
    return { note: `telnyx: hung up call_control_id=${ctx.callControlId}` };
  }

  async transferToHuman(ctx: TelnyxCallContext, destination: string) {
    // `to` is the human destination; `from` is the caller-id shown to them (the
    // hotel's own number). connection_id, when set, selects the outbound voice
    // profile used for the leg.
    const body: Record<string, unknown> = { to: destination };
    if (ctx.toNumber) body.from = ctx.toNumber;
    if (env.TELNYX_CONNECTION_ID) body.connection_id = env.TELNYX_CONNECTION_ID;
    await this.command(ctx.callControlId, "transfer", body);
    return { note: `telnyx: transferring call_control_id=${ctx.callControlId} -> ${destination}` };
  }

  async startStreaming(ctx: TelnyxCallContext, streamUrl: string) {
    await this.command(ctx.callControlId, "streaming_start", {
      stream_url: streamUrl,
      stream_track: "inbound_track",
      // Bidirectional RTP so we can also stream synthesized audio back to the
      // caller over the same WS. PCMU = G.711 μ-law 8kHz.
      stream_bidirectional_mode: "rtp",
      stream_bidirectional_codec: "PCMU",
    });
    return { note: `telnyx: streaming_start call_control_id=${ctx.callControlId} -> ${streamUrl}` };
  }

  async speak(ctx: TelnyxCallContext, text: string, opts?: { voice?: string; language?: string }) {
    await this.command(ctx.callControlId, "speak", {
      payload: text,
      voice: opts?.voice ?? "female",
      language: opts?.language ?? "en-US",
    });
    return { note: `telnyx: speak on call_control_id=${ctx.callControlId}` };
  }
}

export function getTelnyxAdapter(): TelnyxAdapter {
  if (telnyxLive) return new RealTelnyxAdapter(env.TELNYX_API_KEY as string);
  return new StubTelnyxAdapter();
}
