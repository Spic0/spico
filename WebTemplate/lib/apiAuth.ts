import { hashApiKey, hasScope, type ApiScope } from "@/lib/apiKeys";
import { createAdminClient } from "@/lib/supabase/admin";

// Authenticates a Route Handler request against api_keys (Milestone 9). There
// is no Supabase Auth session for an external API caller, so this resolves
// identity purely from the Authorization header and the service-role client
// — the resulting hotelId/organizationId are then used to scope every query
// the route makes by hand (the same responsibility RLS normally carries for a
// logged-in user).

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface AuthenticatedApiKey {
  apiKeyId: string;
  organizationId: string;
  hotelId: string;
  scopes: unknown;
}

export async function authenticateApiRequest(request: Request, requiredScope: ApiScope): Promise<AuthenticatedApiKey> {
  const auth = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(auth);
  const plaintext = match?.[1];
  if (!plaintext) {
    throw new ApiAuthError("Missing or malformed Authorization header (expected: Bearer <api key>)", 401);
  }
  const hash = hashApiKey(plaintext);

  const admin = createAdminClient();
  const { data: key, error } = await admin
    .from("api_keys")
    .select("id, organization_id, hotel_id, scopes, status, expires_at")
    .eq("key_hash", hash)
    .single();

  if (error || !key) {
    throw new ApiAuthError("Invalid API key", 401);
  }
  if (key.status !== "active") {
    throw new ApiAuthError("This API key has been revoked", 401);
  }
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
    throw new ApiAuthError("This API key has expired", 401);
  }
  if (!hasScope(key.scopes, requiredScope)) {
    throw new ApiAuthError(`This API key does not have the "${requiredScope}" scope`, 403);
  }

  // Best-effort — a failure here must not fail the actual request.
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  return { apiKeyId: key.id, organizationId: key.organization_id, hotelId: key.hotel_id, scopes: key.scopes };
}
