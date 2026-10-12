import { createClient } from "@supabase/supabase-js";
import { serverOnlyEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

// Service-role client — bypasses RLS entirely. Reserved for genuinely
// system-triggered writes that must not be gated by the acting user's own
// permissions: webhook delivery (a side effect of a business event, not an
// administrative action the triggering user necessarily has webhooks.manage
// for) and the public API routes (app/api/v1/*, which authenticate via an API
// key, not a Supabase Auth session, so there is no auth.uid() for RLS to key
// off). Every query made with this client must scope itself explicitly by
// hotel_id/organization_id — RLS is not doing that job here. Never use this
// for anything a normal user-initiated action can do via the session-scoped
// client in lib/supabase/server.ts; RLS stays the ground truth everywhere else.
export function createAdminClient() {
  const env = serverOnlyEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured — cannot create an admin Supabase client");
  }
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
