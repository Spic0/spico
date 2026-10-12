import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { saveVoiceSettingsAction } from "./actions";

export default async function VoiceSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("voice.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const [{ data: settings }, { data: agents }] = await Promise.all([
    supabase
      .from("hotel_voice_settings")
      .select("enabled, phone_number, default_agent_id, greeting_note")
      .eq("hotel_id", hotel.id)
      .maybeSingle(),
    supabase.from("ai_agents").select("id, name, status").eq("hotel_id", hotel.id).neq("status", "archived").order("name"),
  ]);

  const enabled = settings?.enabled ?? false;

  return (
    <div className="mt--20">
      <p className="spico-muted">
        Enabling voice does not connect a real phone line — it configures which AI agent the voice-service will use
        for the simulate-call test path. A live Telnyx number and OpenAI Realtime connection are separate,
        not-yet-built steps (see voice-service/README.md).
      </p>

      <form action={saveVoiceSettingsAction} className="spico-panel spico-settings-form">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <label className="mb--10" style={{ display: "block" }}>
          <input type="checkbox" name="enabled" defaultChecked={enabled} /> Enable voice for this hotel
        </label>
        <div className="input-wrapper">
          <label htmlFor="phoneNumber">Phone number (placeholder — not a provisioned Telnyx number)</label>
          <input id="phoneNumber" name="phoneNumber" type="text" maxLength={30} defaultValue={settings?.phone_number ?? ""} placeholder="+1 555 0100" />
        </div>
        <div className="input-wrapper">
          <label htmlFor="defaultAgentId">Default AI agent for inbound calls</label>
          <select id="defaultAgentId" name="defaultAgentId" defaultValue={settings?.default_agent_id ?? ""}>
            <option value="">None selected</option>
            {(agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.status})
              </option>
            ))}
          </select>
          {(agents ?? []).length === 0 && (
            <span className="spico-muted">No AI agents yet — create one under AI Agents first.</span>
          )}
        </div>
        <div className="input-wrapper">
          <label htmlFor="greetingNote">Internal note</label>
          <textarea id="greetingNote" name="greetingNote" rows={3} maxLength={1000} defaultValue={settings?.greeting_note ?? ""} />
        </div>
        <button type="submit" className="rts-btn btn-primary">
          Save
        </button>
      </form>
    </div>
  );
}
