import { env } from "./env.js";
import type { TelnyxAdapter, TelnyxCallContext } from "./telnyxAdapter.js";

// Production-safe fallback routing. Whenever the AI path cannot run — voice not
// configured, agent inactive, OpenAI unreachable, a bridge error, etc. — a live
// caller must NEVER be left on dead air. This decides what to do:
//   1. If a fallback human number is configured, transfer the caller to it.
//   2. Otherwise speak a short apology and hang up (so at least the call ends
//      cleanly rather than hanging).
// Returns human-readable notes for the call_events timeline.

export interface FallbackInput {
  telnyx: TelnyxAdapter;
  ctx: TelnyxCallContext;
  reason: string;
  spokenMessage?: string;
  language?: string;
}

export interface FallbackResult {
  action: "transferred" | "spoken_hangup" | "hangup";
  destination: string | null;
  notes: string[];
}

export async function runFallback(input: FallbackInput): Promise<FallbackResult> {
  const notes: string[] = [`fallback triggered: ${input.reason}`];
  const fallbackNumber = env.VOICE_FALLBACK_NUMBER ?? null;

  if (fallbackNumber) {
    try {
      const t = await input.telnyx.transferToHuman(input.ctx, fallbackNumber);
      notes.push(t.note);
      return { action: "transferred", destination: fallbackNumber, notes };
    } catch (err) {
      notes.push(`fallback transfer failed: ${(err as Error).message}`);
      // fall through to speak + hangup
    }
  }

  const message =
    input.spokenMessage ??
    "Sorry, we're unable to take your call right now. Please try again later or contact the hotel directly.";
  try {
    const s = await input.telnyx.speak(input.ctx, message, { language: input.language });
    notes.push(s.note);
    const h = await input.telnyx.hangup(input.ctx);
    notes.push(h.note);
    return { action: "spoken_hangup", destination: null, notes };
  } catch (err) {
    notes.push(`fallback speak/hangup failed: ${(err as Error).message}`);
    try {
      await input.telnyx.hangup(input.ctx);
    } catch {
      /* best effort */
    }
    return { action: "hangup", destination: null, notes };
  }
}
