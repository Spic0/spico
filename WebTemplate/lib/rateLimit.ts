import { serverOnlyEnv } from "@/lib/env";

// Fixed-window rate limiting via Upstash's REST API (Milestone 9). Chosen
// over the @upstash/redis SDK to avoid a new dependency for two simple HTTP
// calls (INCR, then EXPIRE on the first hit in a window) — see
// docs/assumptions.md M9.
//
// No Upstash project is configured in this environment. When
// UPSTASH_REDIS_REST_URL/TOKEN are unset, checkRateLimit() returns
// `{ allowed: true, configured: false }` — requests are NOT actually
// rate-limited, and callers surface that honestly (see app/api/v1/*'s
// X-RateLimit-Configured response header) rather than silently pretending
// enforcement exists.

export interface RateLimitResult {
  allowed: boolean;
  configured: boolean;
  remaining?: number;
  limit?: number;
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  const headers: Record<string, string> = { "x-ratelimit-configured": String(result.configured) };
  if (result.limit !== undefined) headers["x-ratelimit-limit"] = String(result.limit);
  if (result.remaining !== undefined) headers["x-ratelimit-remaining"] = String(result.remaining);
  return headers;
}

function isConfigured(): boolean {
  const env = serverOnlyEnv();
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

async function upstashCommand(path: string): Promise<{ result: string | number | null }> {
  const env = serverOnlyEnv();
  const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/${path}`, {
    headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Upstash REST command failed (${res.status}): ${path}`);
  }
  return (await res.json()) as { result: string | number | null };
}

// Fails OPEN on any Upstash error (network issue, misconfiguration) — an
// outage in the rate limiter should not take down the API it protects. This
// is a deliberate availability-over-strictness choice for a foundation
// feature; revisit if abuse becomes a real concern (see docs/assumptions.md).
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!isConfigured()) {
    return { allowed: true, configured: false };
  }

  try {
    const safeKey = encodeURIComponent(`ratelimit:${key}`);
    const { result } = await upstashCommand(`incr/${safeKey}`);
    const count = Number(result);
    if (count === 1) {
      await upstashCommand(`expire/${safeKey}/${windowSeconds}`);
    }
    return {
      allowed: count <= limit,
      configured: true,
      remaining: Math.max(0, limit - count),
      limit,
    };
  } catch {
    return { allowed: true, configured: true };
  }
}

// SET NX with a TTL — used for request idempotency (see app/api/v1/reservations).
// Returns true if this is the FIRST time this key has been seen (i.e. the
// caller should proceed); false if it's a repeat within the TTL window (the
// caller should return the cached outcome instead of repeating a side effect).
// When Upstash isn't configured, always returns true (idempotency is not
// enforced) — same fail-open stance as checkRateLimit.
export async function claimIdempotencyKey(key: string, ttlSeconds: number): Promise<{ isNew: boolean; configured: boolean }> {
  if (!isConfigured()) {
    return { isNew: true, configured: false };
  }
  try {
    const safeKey = encodeURIComponent(`idempotency:${key}`);
    const { result } = await upstashCommand(`set/${safeKey}/1/EX/${ttlSeconds}/NX`);
    // Upstash returns the string "OK" on success, which the generic {result}
    // shape surfaces as a truthy non-zero value; a null/blocked NX returns null.
    return { isNew: Boolean(result), configured: true };
  } catch {
    return { isNew: true, configured: true };
  }
}
