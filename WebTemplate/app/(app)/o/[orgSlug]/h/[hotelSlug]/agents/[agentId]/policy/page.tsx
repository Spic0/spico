import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { updateAgentApprovalPolicyAction } from "./actions";

const ROLE_OPTIONS = [
  { key: "receptionist", label: "Receptionist" },
  { key: "reception_manager", label: "Reception Manager" },
  { key: "reception_managers_manager", label: "Reception Managers Manager" },
  { key: "hotel_general_manager", label: "Hotel General Manager" },
  { key: "hotel_owner", label: "Hotel Owner" },
] as const;

export default async function AgentPolicyPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, agentId);
  const user = await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "ai_agents.manage_policies", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: policy, error } = await supabase
    .from("ai_agent_approval_policies")
    .select("*")
    .eq("agent_id", agentId)
    .single();

  if (error || !policy) {
    throw new Error(`Failed to load approval policy: ${error?.message ?? "not found"}`);
  }

  return (
    <div>
      <div className="spico-callout">
        <strong>Operating mode: {agent.operating_mode.replace("_", " ")}.</strong> Manual Assist requires human
        approval for every action regardless of this policy. Semi-Automatic and Automatic use this policy to decide
        what still needs approval. No live approval queue exists yet — this only stores the policy.
      </div>

      <form action={updateAgentApprovalPolicyAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="agentId" value={agentId} />

        <p style={{ fontWeight: 500 }}>Who can approve actions</p>
        <div className="spico-checkbox-grid">
          {ROLE_OPTIONS.map((role) => (
            <label className="form-check" key={role.key}>
              <input
                className="form-check-input"
                type="checkbox"
                name="approverRoles"
                value={role.key}
                defaultChecked={policy.approver_roles.includes(role.key)}
                disabled={!canManage}
              />
              <span className="form-check-label">{role.label}</span>
            </label>
          ))}
        </div>

        <div className="input-wrapper mt--10">
          <label htmlFor="approvalExpiryMinutes">Approval expiry (minutes)</label>
          <input
            id="approvalExpiryMinutes"
            name="approvalExpiryMinutes"
            type="number"
            min={1}
            max={10080}
            defaultValue={policy.approval_expiry_minutes}
            disabled={!canManage}
            required
          />
        </div>
        <div className="input-wrapper">
          <label htmlFor="defaultFallback">Default fallback when no one approves</label>
          <select id="defaultFallback" name="defaultFallback" defaultValue={policy.default_fallback} disabled={!canManage}>
            <option value="escalate_to_human">Escalate to human</option>
            <option value="auto_deny">Auto-deny</option>
            <option value="send_fallback_message">Send fallback message</option>
          </select>
        </div>

        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            name="allowAutomaticLowRiskReplies"
            defaultChecked={policy.allow_automatic_low_risk_replies}
            disabled={!canManage}
          />
          <span className="form-check-label">AI may send low-risk replies automatically</span>
        </label>
        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            name="guestVisibleMessagesRequireApproval"
            defaultChecked={policy.guest_visible_messages_require_approval}
            disabled={!canManage}
          />
          <span className="form-check-label">Guest-visible messages require approval</span>
        </label>
        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            name="reservationRequestsAlwaysRequireApproval"
            defaultChecked={policy.reservation_requests_always_require_approval}
            disabled={!canManage}
          />
          <span className="form-check-label">Reservation-related requests always require approval</span>
        </label>

        {canManage && (
          <button type="submit" className="rts-btn btn-primary mt--20">
            Save policy
          </button>
        )}
      </form>
    </div>
  );
}
