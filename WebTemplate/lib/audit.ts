import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { AuditActorType } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEntryInput {
  actorProfileId?: string | null;
  actorType?: AuditActorType;
  aiSessionId?: string | null;
  organizationId?: string | null;
  hotelId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
}

// Every security-sensitive mutation and every AI-triggered data change must
// call this. Never swallow the error — a failed audit write means the
// mutation happened without a trace, which callers need to know about.
//
// `client` defaults to the session-scoped client (RLS applies, requires a
// logged-in actor). Pass the service-role admin client (lib/supabase/admin.ts)
// for genuinely system/API-triggered entries — e.g. app/api/v1/* routes,
// which authenticate via an API key and have no Supabase Auth session for RLS
// to key off. actorProfileId must be omitted/null for actor_type
// 'ai'/'system' — the DB CHECK constraint only requires it for 'user'.
export async function writeAuditLog(
  entry: AuditEntryInput,
  client?: SupabaseClient<Database>,
): Promise<void> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.from("audit_log").insert({
    actor_profile_id: entry.actorProfileId ?? null,
    actor_type: entry.actorType ?? "user",
    ai_session_id: entry.aiSessionId ?? null,
    organization_id: entry.organizationId ?? null,
    hotel_id: entry.hotelId ?? null,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });

  if (error) {
    throw new Error(`Failed to write audit log entry for "${entry.action}": ${error.message}`);
  }
}
