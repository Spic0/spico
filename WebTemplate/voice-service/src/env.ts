import { z } from "zod";

// This service is deliberately independent of the Next.js app (see README.md
// "Why a separate service") — it does not import lib/env.ts, it validates its
// own environment the same way.
//
// M15 adds real Telnyx + OpenAI Realtime activation. Every provider var is
// optional at load time so the service still boots (and the simulate/stub path
// still works) with none of them set. Whether a live provider is actually used
// is decided by the `telnyxLive` / `openaiLive` helpers below — presence of
// credentials, not a mode flag, flips real vs stub. See getVoiceMode().
const envSchema = z.object({
  PORT: z.string().default("4001"),
  SUPABASE_URL: z.string().min(1, "SUPABASE_URL is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  VOICE_SERVICE_SHARED_SECRET: z.string().min(1, "VOICE_SERVICE_SHARED_SECRET is required"),

  // --- Telnyx Call Control (M15) ---------------------------------------------
  // TELNYX_API_KEY   → REST call-control commands (answer/hangup/transfer/stream).
  // TELNYX_PUBLIC_KEY→ Ed25519 public key from the portal, used to VERIFY inbound
  //                    webhook signatures (telnyx-signature-ed25519 header).
  TELNYX_API_KEY: z.string().optional(),
  TELNYX_PUBLIC_KEY: z.string().optional(),
  // Reject webhooks whose telnyx-timestamp is older than this (replay guard).
  TELNYX_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),

  // --- OpenAI Realtime (M15) -------------------------------------------------
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  OPENAI_REALTIME_VOICE: z.string().default("alloy"),

  // Public HTTPS/WSS base URL this service is reachable at (e.g. an ngrok URL
  // or a real deployment). Telnyx must reach `${PUBLIC_BASE_URL}/webhooks/telnyx`
  // and stream media to `${PUBLIC_WSS_URL or derived}/realtime`. Required for a
  // live call; unused by the simulate/stub path.
  PUBLIC_BASE_URL: z.string().url().optional(),

  // E.164 number to transfer to when the AI path cannot run (no agent, provider
  // error, etc.) — production-safe fallback routing. If unset, the fallback
  // hangs up gracefully after a spoken message instead of transferring.
  VOICE_FALLBACK_NUMBER: z.string().optional(),
  // Caller-ID / connection used when transferring or dialing out (Telnyx
  // outbound voice profile / connection id). Optional; transfer uses the
  // hotel's own number as caller id when unset.
  TELNYX_CONNECTION_ID: z.string().optional(),
});

export type VoiceServiceEnv = z.infer<typeof envSchema>;

function loadEnv(): VoiceServiceEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid voice-service environment configuration:\n${parsed.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();

// True when real Telnyx call-control can be performed / webhooks verified.
export const telnyxLive = Boolean(env.TELNYX_API_KEY && env.TELNYX_PUBLIC_KEY);
// True when a real OpenAI Realtime session can be opened.
export const openaiLive = Boolean(env.OPENAI_API_KEY);

// Derive the public wss:// base for the Telnyx media stream_url from
// PUBLIC_BASE_URL (https -> wss, http -> ws). Returns null if not configured.
export function publicRealtimeStreamUrl(): string | null {
  if (!env.PUBLIC_BASE_URL) return null;
  const wsBase = env.PUBLIC_BASE_URL.replace(/^http/, "ws").replace(/\/$/, "");
  return `${wsBase}/realtime`;
}

export interface VoiceMode {
  telnyx: "live" | "stub";
  openai: "live" | "stub";
  publicUrl: string | null;
  fallbackNumber: string | null;
  fullyLive: boolean;
}

// One place that describes what will actually happen on a call, surfaced by
// /health so an operator can see at a glance whether they're on real providers.
export function getVoiceMode(): VoiceMode {
  return {
    telnyx: telnyxLive ? "live" : "stub",
    openai: openaiLive ? "live" : "stub",
    publicUrl: env.PUBLIC_BASE_URL ?? null,
    fallbackNumber: env.VOICE_FALLBACK_NUMBER ?? null,
    fullyLive: telnyxLive && openaiLive && Boolean(env.PUBLIC_BASE_URL),
  };
}
