import { createPublicKey, verify as edVerify } from "node:crypto";

// Telnyx signs every webhook with Ed25519. Two headers accompany the raw body:
//   telnyx-signature-ed25519 : base64 signature
//   telnyx-timestamp         : unix seconds
// The signed message is exactly `${timestamp}|${rawBody}` (raw bytes, before
// any JSON parse — so the caller must pass the untouched request body). The
// public key is the base64 "Public Key" shown in the Telnyx portal
// (Account → Keys & Credentials → Public Key).
//
// This is fully unit-testable offline (see selfTest below) even though we have
// no live Telnyx account — the crypto is standard Ed25519.

// Telnyx's public key is a raw 32-byte Ed25519 key, base64-encoded. Node's
// crypto wants a KeyObject; wrap the raw key in the DER SubjectPublicKeyInfo
// prefix for Ed25519 so createPublicKey accepts it.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function ed25519PublicKeyFromBase64(base64Key: string) {
  const raw = Buffer.from(base64Key, "base64");
  if (raw.length !== 32) {
    throw new Error(`Expected a 32-byte Ed25519 public key, got ${raw.length} bytes`);
  }
  const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

export interface VerifyWebhookArgs {
  rawBody: string;
  signatureBase64: string | undefined;
  timestamp: string | undefined;
  publicKeyBase64: string;
  toleranceSeconds: number;
  now?: number; // seconds; injectable for tests
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

export function verifyTelnyxWebhook(args: VerifyWebhookArgs): VerifyResult {
  const { rawBody, signatureBase64, timestamp, publicKeyBase64, toleranceSeconds } = args;
  if (!signatureBase64) return { valid: false, reason: "missing telnyx-signature-ed25519 header" };
  if (!timestamp) return { valid: false, reason: "missing telnyx-timestamp header" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { valid: false, reason: "non-numeric timestamp" };
  const now = args.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > toleranceSeconds) {
    return { valid: false, reason: `timestamp outside tolerance (${toleranceSeconds}s)` };
  }

  let key;
  try {
    key = ed25519PublicKeyFromBase64(publicKeyBase64);
  } catch (err) {
    return { valid: false, reason: `invalid public key: ${(err as Error).message}` };
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(signatureBase64, "base64");
  } catch {
    return { valid: false, reason: "signature is not valid base64" };
  }

  const signedPayload = Buffer.from(`${timestamp}|${rawBody}`, "utf8");
  const ok = edVerify(null, signedPayload, key, signature);
  return ok ? { valid: true } : { valid: false, reason: "signature does not match" };
}
