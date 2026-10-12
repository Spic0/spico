import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { StatusChip } from "@/components/ui/StatusChip";
import { setOrganizationStatusAction } from "./actions";

export default async function PlatformAdminPage() {
  const user = await requirePlatformRole(["moderator", "admin", "superadmin"]);
  const supabase = await createClient();
  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load organizations: ${error.message}`);
  }

  const canManage = user.platformRole === "admin" || user.platformRole === "superadmin";

  return (
    <div className="pt--40">
      <h4 className="title">Platform Administration</h4>
      <p>All organizations on Spico.</p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>ID</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Created</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(organizations ?? []).map((org) => (
            <tr key={org.id}>
              <td>{org.name}</td>
              <td>
                <code>{org.id}</code>
              </td>
              <td>{org.slug}</td>
              <td>
                <StatusChip status={org.status} />
              </td>
              <td>{new Date(org.created_at).toLocaleDateString()}</td>
              {canManage && (
                <td>
                  <form action={setOrganizationStatusAction}>
                    <input type="hidden" name="organizationId" value={org.id} />
                    <input
                      type="hidden"
                      name="nextStatus"
                      value={org.status === "active" ? "suspended" : "active"}
                    />
                    <button
                      type="submit"
                      className={`rts-btn btn-${org.status === "active" ? "danger" : "primary"} btn-sm`}
                    >
                      {org.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
