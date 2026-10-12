import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Service-role client: bypasses RLS entirely. This is the one legitimate
// server-to-server use of the service role in the whole system — a real call
// arrives with no logged-in Supabase Auth user attached, so there is no
// session to scope a normal client to. Every write this service makes is
// still scoped explicitly by hotel_id/organization_id in the query itself.
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
