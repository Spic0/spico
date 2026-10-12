import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { savePlatformSettingsAction } from "./actions";

export default async function PlatformSettingsPage() {
  const user = await requirePlatformRole(["moderator", "admin", "superadmin"]);
  const canManage = user.platformRole === "admin" || user.platformRole === "superadmin";

  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("platform_settings")
    .select("platform_name, support_email, maintenance_mode, announcement_message")
    .single();
  if (error) throw new Error(`Failed to load platform settings: ${error.message}`);

  return (
    <div className="pt--40">
      <h4 className="title">Platform settings</h4>
      <p className="spico-muted">
        Global, deployment-wide configuration. <code>maintenance_mode</code>/<code>announcement_message</code> are
        stored but not yet read by any page (no maintenance banner exists yet) — see docs/roadmap.md.
      </p>

      {canManage ? (
        <form action={savePlatformSettingsAction} className="spico-panel spico-settings-form">
          <div className="input-wrapper">
            <label htmlFor="platformName">Platform name</label>
            <input id="platformName" name="platformName" defaultValue={settings.platform_name} required maxLength={120} />
          </div>
          <div className="input-wrapper">
            <label htmlFor="supportEmail">Support email</label>
            <input id="supportEmail" name="supportEmail" type="email" defaultValue={settings.support_email ?? ""} />
          </div>
          <label className="mb--10" style={{ display: "block" }}>
            <input type="checkbox" name="maintenanceMode" defaultChecked={settings.maintenance_mode} /> Maintenance mode
          </label>
          <div className="input-wrapper">
            <label htmlFor="announcementMessage">Announcement message</label>
            <textarea id="announcementMessage" name="announcementMessage" rows={3} defaultValue={settings.announcement_message ?? ""} maxLength={1000} />
          </div>
          <button type="submit" className="rts-btn btn-primary">
            Save
          </button>
        </form>
      ) : (
        <div className="spico-panel">
          <p>
            <strong>Platform name:</strong> {settings.platform_name}
          </p>
          <p>
            <strong>Support email:</strong> {settings.support_email ?? "—"}
          </p>
          <p>
            <strong>Maintenance mode:</strong> {settings.maintenance_mode ? "On" : "Off"}
          </p>
        </div>
      )}
    </div>
  );
}
