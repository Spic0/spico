import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { CAPABILITY_REGISTRY } from "@/lib/agentCapabilities";
import { updateAgentCapabilitiesAction } from "./actions";

export default async function AgentCapabilitiesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await getAgentByIdOrNotFound(hotel.id, agentId);
  const user = await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "ai_agents.manage_capabilities", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("ai_agent_capabilities")
    .select("capability_key, enabled, approval_required")
    .eq("agent_id", agentId);

  if (error) {
    throw new Error(`Failed to load capabilities: ${error.message}`);
  }

  const byKey = new Map((rows ?? []).map((r) => [r.capability_key, r]));

  return (
    <div>
      <p className="spico-muted">
        Capabilities are configuration only in M3 — enabling one does not execute a reservation, message, call, or
        external action. Human handoff and emergency escalation always stay enabled.
      </p>
      <form action={updateAgentCapabilitiesAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="agentId" value={agentId} />

        <table className="spico-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Risk</th>
              <th>Enabled</th>
              <th>Approval required</th>
            </tr>
          </thead>
          <tbody>
            {CAPABILITY_REGISTRY.map((capability) => {
              const row = byKey.get(capability.key);
              return (
                <tr key={capability.key}>
                  <td>
                    <strong>{capability.displayName}</strong>
                    <br />
                    <span className="spico-muted">{capability.description}</span>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{capability.defaultRiskLevel}</td>
                  <td>
                    <input
                      type="checkbox"
                      name={`enabled_${capability.key}`}
                      defaultChecked={row?.enabled ?? capability.protected}
                      disabled={!canManage || capability.protected}
                    />
                    {capability.protected && <div className="spico-muted">Always on</div>}
                  </td>
                  <td>
                    <select
                      name={`approval_${capability.key}`}
                      defaultValue={row?.approval_required === null || row?.approval_required === undefined ? "" : String(row.approval_required)}
                      disabled={!canManage}
                    >
                      <option value="">Inherit default ({capability.defaultApprovalRequired ? "required" : "not required"})</option>
                      <option value="true">Require approval</option>
                      <option value="false">Don&apos;t require approval</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {canManage && (
          <button type="submit" className="rts-btn btn-primary mt--10">
            Save capabilities
          </button>
        )}
      </form>
    </div>
  );
}
