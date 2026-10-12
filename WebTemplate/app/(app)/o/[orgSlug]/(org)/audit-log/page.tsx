import { PageHeader } from "@/components/layout/PageHeader";
import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

export default async function OrgAuditLogPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  await requirePermission("audit_log.view", { organizationId: organization.id });

  const supabase = await createClient();
  const { data: entries, error } = await supabase
    .from("audit_log")
    .select("id, action, target_type, target_id, actor_type, actor_profile_id, created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to load audit log: ${error.message}`);
  }

  const actorIds = Array.from(
    new Set((entries ?? []).map((entry) => entry.actor_profile_id).filter((id): id is string => id !== null)),
  );
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, email").in("id", actorIds)
    : { data: [] };
  const actorEmailById = new Map((actors ?? []).map((actor) => [actor.id, actor.email]));

  return (
    <div className="pt--40">
      <PageHeader title="Audit Log" subtitle={organization.name} />
      <table className="spico-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {(entries ?? []).map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.created_at).toLocaleString()}</td>
              <td>
                {entry.actor_type === "user"
                  ? (entry.actor_profile_id && actorEmailById.get(entry.actor_profile_id)) ?? "unknown"
                  : entry.actor_type}
              </td>
              <td>{entry.action}</td>
              <td>
                {entry.target_type}
                {entry.target_id ? ` #${entry.target_id.slice(0, 8)}` : ""}
              </td>
            </tr>
          ))}
          {(entries ?? []).length === 0 && (
            <tr>
              <td colSpan={4}>No audit log entries yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
