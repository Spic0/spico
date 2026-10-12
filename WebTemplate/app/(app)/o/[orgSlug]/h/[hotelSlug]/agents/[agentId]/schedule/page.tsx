import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { updateAgentScheduleAction, updateAgentHandoffAction } from "./actions";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function AgentSchedulePage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, agentId);
  const user = await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManageSchedule = await hasPermission(user.id, "ai_agents.manage_schedules", { hotelId: hotel.id });
  const canManageHandoff = await hasPermission(user.id, "ai_agents.manage_handoff", { hotelId: hotel.id });

  const supabase = await createClient();
  const [{ data: overrides, error: overridesError }, { data: handoff, error: handoffError }, { data: departments }] =
    await Promise.all([
      supabase
        .from("ai_agent_schedules")
        .select("day_of_week, is_closed, open_time, close_time")
        .eq("agent_id", agentId)
        .eq("shift_index", 1),
      supabase.from("ai_agent_handoff_rules").select("*").eq("agent_id", agentId).single(),
      supabase.from("departments").select("id, name").eq("hotel_id", hotel.id).eq("status", "active"),
    ]);

  if (overridesError) throw new Error(`Failed to load agent schedule: ${overridesError.message}`);
  if (handoffError || !handoff) throw new Error(`Failed to load handoff rules: ${handoffError?.message ?? "not found"}`);

  const overrideByDay = new Map((overrides ?? []).map((o) => [o.day_of_week, o]));

  return (
    <div>
      <h5 className="title">Schedule</h5>
      <form action={updateAgentScheduleAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="agentId" value={agentId} />

        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            name="useHotelHours"
            defaultChecked={agent.use_hotel_business_hours}
            disabled={!canManageSchedule}
          />
          <span className="form-check-label">Use the hotel&apos;s business hours (from the Business Hours page)</span>
        </label>

        <table className="spico-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Closed</th>
              <th>Open</th>
              <th>Close</th>
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((label, index) => {
              const day = index + 1;
              const override = overrideByDay.get(day);
              return (
                <tr key={day}>
                  <td>{label}</td>
                  <td>
                    <input
                      type="checkbox"
                      name={`day_${day}_closed`}
                      defaultChecked={override?.is_closed ?? false}
                      disabled={!canManageSchedule}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`day_${day}_open`}
                      defaultValue={override?.open_time?.slice(0, 5) ?? ""}
                      disabled={!canManageSchedule}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`day_${day}_close`}
                      defaultValue={override?.close_time?.slice(0, 5) ?? ""}
                      disabled={!canManageSchedule}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="spico-muted">The grid above only applies when &quot;Use the hotel&apos;s business hours&quot; is unchecked.</p>

        <div className="input-wrapper">
          <label htmlFor="holidayBehavior">Holiday behavior</label>
          <select id="holidayBehavior" name="holidayBehavior" defaultValue={agent.holiday_behavior} disabled={!canManageSchedule}>
            <option value="follow_hotel">Follow the hotel&apos;s holiday settings</option>
            <option value="operate_normally">Operate normally</option>
            <option value="custom_rule">Use a custom holiday rule</option>
          </select>
        </div>
        <div className="input-wrapper">
          <label htmlFor="outsideHoursBehavior">Outside-hours behavior</label>
          <select
            id="outsideHoursBehavior"
            name="outsideHoursBehavior"
            defaultValue={agent.outside_hours_behavior}
            disabled={!canManageSchedule}
          >
            <option value="transfer_reception">Transfer to reception</option>
            <option value="transfer_oncall">Transfer to on-call number</option>
            <option value="create_message_request">Create a message request</option>
            <option value="fallback_message">Use fallback message</option>
            <option value="disable_agent">Disable agent</option>
          </select>
        </div>

        {canManageSchedule && (
          <button type="submit" className="rts-btn btn-primary mt--10">
            Save schedule
          </button>
        )}
      </form>

      <h5 className="title mt--30">Human handoff</h5>
      <p className="spico-muted">Stored configuration only — not yet connected to Telnyx or any phone system.</p>
      <form action={updateAgentHandoffAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="agentId" value={agentId} />

        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            name="handoffEnabled"
            defaultChecked={handoff.handoff_enabled}
            disabled={!canManageHandoff}
          />
          <span className="form-check-label">Handoff enabled</span>
        </label>

        <div className="input-wrapper">
          <label htmlFor="primaryDepartmentId">Primary handoff department</label>
          <select
            id="primaryDepartmentId"
            name="primaryDepartmentId"
            defaultValue={handoff.primary_department_id ?? ""}
            disabled={!canManageHandoff}
          >
            <option value="">None</option>
            {(departments ?? []).map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>
        <div className="input-wrapper">
          <label htmlFor="primaryPhonePlaceholder">Primary handoff phone (placeholder)</label>
          <input
            id="primaryPhonePlaceholder"
            name="primaryPhonePlaceholder"
            type="text"
            defaultValue={handoff.primary_phone_placeholder ?? ""}
            disabled={!canManageHandoff}
          />
        </div>
        <div className="input-wrapper">
          <label htmlFor="backupPhonePlaceholder">Backup handoff phone (placeholder)</label>
          <input
            id="backupPhonePlaceholder"
            name="backupPhonePlaceholder"
            type="text"
            defaultValue={handoff.backup_phone_placeholder ?? ""}
            disabled={!canManageHandoff}
          />
        </div>

        <p className="mt--10" style={{ fontWeight: 500 }}>
          Hand off when:
        </p>
        <div className="spico-checkbox-grid">
          {(
            [
              ["conditionGuestRequestsHuman", handoff.condition_guest_requests_human, "Guest asks for a human"],
              ["conditionLowConfidence", handoff.condition_low_confidence, "Agent confidence is low"],
              ["conditionUnsupportedLanguage", handoff.condition_unsupported_language, "Unsupported language"],
              ["conditionEmergency", handoff.condition_emergency, "Emergency or sensitive request"],
              ["conditionOutsideHours", handoff.condition_outside_hours, "Outside configured working hours"],
              ["conditionCapabilityDisabled", handoff.condition_capability_disabled, "Capability disabled"],
              ["conditionHighRisk", handoff.condition_high_risk, "High-risk request"],
            ] as const
          ).map(([name, checked, label]) => (
            <label className="form-check" key={name}>
              <input
                className="form-check-input"
                type="checkbox"
                name={name}
                defaultChecked={checked}
                disabled={!canManageHandoff}
              />
              <span className="form-check-label">{label}</span>
            </label>
          ))}
        </div>

        <div className="input-wrapper mt--10">
          <label htmlFor="handoffMessage">Handoff message</label>
          <textarea
            id="handoffMessage"
            name="handoffMessage"
            rows={2}
            defaultValue={handoff.handoff_message ?? ""}
            disabled={!canManageHandoff}
          />
        </div>
        <div className="input-wrapper">
          <label htmlFor="fallbackWhenUnavailable">If the human team is unavailable</label>
          <select
            id="fallbackWhenUnavailable"
            name="fallbackWhenUnavailable"
            defaultValue={handoff.fallback_when_unavailable}
            disabled={!canManageHandoff}
          >
            <option value="create_message_request">Create a message request</option>
            <option value="fallback_message">Use fallback message</option>
            <option value="keep_trying_backup">Keep trying the backup number</option>
          </select>
        </div>

        {canManageHandoff && (
          <button type="submit" className="rts-btn btn-primary mt--10">
            Save handoff rules
          </button>
        )}
      </form>
    </div>
  );
}
