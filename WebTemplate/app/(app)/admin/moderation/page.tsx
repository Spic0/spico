import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { StatusChip } from "@/components/ui/StatusChip";
import { raiseModerationFlagAction, resolveModerationFlagAction } from "./actions";

export default async function ModerationPage() {
  const user = await requirePlatformRole(["moderator", "admin", "superadmin"]);
  const canResolve = user.platformRole === "admin" || user.platformRole === "superadmin";

  const supabase = await createClient();
  const { data: flags, error } = await supabase
    .from("platform_moderation_flags")
    .select("id, target_type, target_id, reason, status, resolution_note, created_at")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load moderation flags: ${error.message}`);

  return (
    <div className="pt--40">
      <h4 className="title">Moderation</h4>
      <p className="spico-muted">
        Any platform role can raise a flag against an organization or hotel for review. Only admin/superadmin can
        resolve one or take further action (e.g. suspend, from the Organizations page).
      </p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Target</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Raised</th>
            {canResolve && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(flags ?? []).map((f) => (
            <tr key={f.id}>
              <td>
                {f.target_type}: <code>{f.target_id.slice(0, 8)}…</code>
              </td>
              <td>{f.reason}</td>
              <td>
                <StatusChip status={f.status} />
                {f.resolution_note && <div className="spico-muted">{f.resolution_note}</div>}
              </td>
              <td className="spico-muted">{new Date(f.created_at).toLocaleString()}</td>
              {canResolve && (
                <td>
                  {f.status === "open" && (
                    <form action={resolveModerationFlagAction} className="spico-inline-form">
                      <input type="hidden" name="flagId" value={f.id} />
                      <input name="resolutionNote" placeholder="Resolution note (optional)" maxLength={1000} />
                      <button type="submit" className="rts-btn btn-primary">
                        Resolve
                      </button>
                    </form>
                  )}
                </td>
              )}
            </tr>
          ))}
          {(flags ?? []).length === 0 && (
            <tr>
              <td colSpan={canResolve ? 5 : 4}>No flags yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h5 className="title mt--30">Raise a flag</h5>
      <form action={raiseModerationFlagAction} className="spico-panel spico-settings-form">
        <div className="input-wrapper">
          <label htmlFor="targetType">Target type</label>
          <select id="targetType" name="targetType" required>
            <option value="organization">Organization</option>
            <option value="hotel">Hotel</option>
          </select>
        </div>
        <div className="input-wrapper">
          <label htmlFor="targetId">Target id</label>
          <input id="targetId" name="targetId" required placeholder="UUID — copy from Organizations" />
        </div>
        <div className="input-wrapper">
          <label htmlFor="reason">Reason</label>
          <textarea id="reason" name="reason" rows={3} required minLength={5} maxLength={1000} />
        </div>
        <button type="submit" className="rts-btn btn-primary">
          Raise flag
        </button>
      </form>
    </div>
  );
}
