import { createHmac, randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Outbound webhook delivery (Milestone 9). Delivery is SYNCHRONOUS and
// INLINE with the request that triggered the event — up to 3 attempts with a
// short backoff, all within the same request/response cycle. There is no
// durable queue or background worker: if all 3 inline attempts fail, the
// delivery is marked 'failed' and nothing retries it later. A real
// queue-backed version (Upstash-backed job queue, or a worker analogous to
// voice-service) is listed as follow-up work in docs/assumptions.md.
//
// emitWebhookEvent() is best-effort and NEVER throws — a webhook subscriber
// being down must not break the reservation/booking action that triggered it.

export type WebhookEventType =
  | "reservation.created"
  | "reservation.status_changed"
  | "reservation.checked_in"
  | "reservation.checked_out";

export const EVENT_TYPES: { value: WebhookEventType; label: string }[] = [
  { value: "reservation.created", label: "Reservation created" },
  { value: "reservation.status_changed", label: "Reservation status changed" },
  { value: "reservation.checked_in", label: "Reservation checked in" },
  { value: "reservation.checked_out", label: "Reservation checked out" },
];

export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPES.find((e) => e.value === eventType)?.label ?? eventType;
}

export function signPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

interface EmitParams {
  hotelId: string;
  eventType: WebhookEventType;
  eventId: string;
  data: Record<string, unknown>;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 250, 750];
const DELIVERY_TIMEOUT_MS = 5000;

export async function emitWebhookEvent(params: EmitParams): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: webhooks } = await admin
      .from("webhooks")
      .select("id, organization_id, hotel_id, url, secret, event_types")
      .eq("hotel_id", params.hotelId)
      .eq("status", "active");

    const subscribed = (webhooks ?? []).filter(
      (w) => Array.isArray(w.event_types) && (w.event_types as string[]).includes(params.eventType),
    );

    await Promise.all(subscribed.map((webhook) => deliverToOneWebhook(admin, webhook, params)));
  } catch (err) {
    // Never let a webhook-system failure surface to the caller of
    // emitWebhookEvent — the triggering business action already succeeded.
    console.error("emitWebhookEvent failed:", err instanceof Error ? err.message : err);
  }
}

async function deliverToOneWebhook(
  admin: ReturnType<typeof createAdminClient>,
  webhook: { id: string; url: string; secret: string },
  params: EmitParams,
): Promise<void> {
  const idempotencyKey = `${params.eventType}:${params.eventId}`;
  const body = JSON.stringify({
    id: params.eventId,
    event: params.eventType,
    created_at: new Date().toISOString(),
    data: params.data,
  });
  const signature = signPayload(webhook.secret, body);

  const { data: delivery, error: insertError } = await admin
    .from("webhook_deliveries")
    .insert({ webhook_id: webhook.id, event_type: params.eventType, idempotency_key: idempotencyKey, payload: JSON.parse(body) })
    .select("id")
    .single();

  if (insertError || !delivery) {
    // Unique-violation on (webhook_id, idempotency_key) means this exact
    // event was already recorded for this webhook — do not deliver twice.
    return;
  }

  let lastStatus: number | null = null;
  let lastExcerpt: string | null = null;
  let delivered = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (BACKOFF_MS[attempt - 1]) {
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt - 1]));
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-spico-event": params.eventType,
          "x-spico-delivery": idempotencyKey,
          "x-spico-signature": signature,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      lastStatus = res.status;
      lastExcerpt = (await res.text().catch(() => "")).slice(0, 500);
      if (res.ok) {
        delivered = true;
        break;
      }
    } catch (err) {
      lastStatus = null;
      lastExcerpt = err instanceof Error ? err.message.slice(0, 500) : "request failed";
    }

    await admin
      .from("webhook_deliveries")
      .update({ attempt_count: attempt, last_attempt_at: new Date().toISOString(), response_status: lastStatus, response_excerpt: lastExcerpt })
      .eq("id", delivery.id);
  }

  await admin.from("webhook_deliveries").update({ status: delivered ? "delivered" : "failed" }).eq("id", delivery.id);
}
