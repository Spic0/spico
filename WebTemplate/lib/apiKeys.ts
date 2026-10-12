import { randomBytes, createHash } from "crypto";

// Open API key generation/hashing (Milestone 9). Bearer-token pattern: the
// plaintext key is the credential, so only its SHA-256 hash is ever stored
// (lib/supabase/types.ts api_keys.key_hash) — the plaintext is returned once,
// at creation, and never persisted or logged. Contrast with lib/webhooks.ts's
// secret, which IS stored retrievably for a different reason (see that file).

const KEY_PREFIX = "spico_live_";
const KEY_RANDOM_BYTES = 24; // -> 32 base64url chars of entropy

export interface GeneratedApiKey {
  plaintext: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const random = randomBytes(KEY_RANDOM_BYTES).toString("base64url");
  const plaintext = `${KEY_PREFIX}${random}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, KEY_PREFIX.length + 8), // shown in the UI to help identify a key without revealing it
    hash: hashApiKey(plaintext),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

// Scope registry. Deliberately small and additive — a handful of coarse
// scopes rather than mirroring every internal `PermissionKey`, since external
// integrations should be grantable the narrowest capability that makes sense
// for a third party, not the full internal permission surface.
export type ApiScope = "read:availability" | "write:reservations" | "read:reservations";

export interface ApiScopeDefinition {
  scope: ApiScope;
  label: string;
  description: string;
}

export const API_SCOPES: ApiScopeDefinition[] = [
  { scope: "read:availability", label: "Read availability", description: "Look up room type availability and prices." },
  { scope: "write:reservations", label: "Create reservations", description: "Create new reservations." },
  { scope: "read:reservations", label: "Read reservations", description: "List and look up reservations." },
];

export function apiScopeLabel(scope: string): string {
  return API_SCOPES.find((s) => s.scope === scope)?.label ?? scope;
}

export function hasScope(scopes: unknown, required: ApiScope): boolean {
  return Array.isArray(scopes) && scopes.includes(required);
}
