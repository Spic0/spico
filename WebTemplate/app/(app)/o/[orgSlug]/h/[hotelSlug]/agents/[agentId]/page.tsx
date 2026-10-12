import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { updateAgentOverviewAction, setAgentActivationAction, archiveAgentAction } from "./actions";

export default async function AgentOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, agentId);
  const user = await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });
  const canUpdate = await hasPermission(user.id, "ai_agents.update", { hotelId: hotel.id });
  const canActivate = await hasPermission(user.id, "ai_agents.activate", { hotelId: hotel.id });
  const canArchive = await hasPermission(user.id, "ai_agents.archive", { hotelId: hotel.id });

  return (
    <div>
      <div className="spico-inline-form mt--10">
        {canActivate && agent.status !== "active" && agent.status !== "archived" && (
          <form action={setAgentActivationAction}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="agentId" value={agentId} />
            <input type="hidden" name="nextStatus" value="active" />
            <button type="submit" className="rts-btn btn-primary">
              Activate
            </button>
          </form>
        )}
        {canActivate && agent.status === "active" && (
          <form action={setAgentActivationAction}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="agentId" value={agentId} />
            <input type="hidden" name="nextStatus" value="inactive" />
            <button type="submit" className="rts-btn btn-primary">
              Deactivate
            </button>
          </form>
        )}
        {canArchive && agent.status !== "archived" && (
          <form action={archiveAgentAction}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="agentId" value={agentId} />
            <input type="hidden" name="nextStatus" value="archived" />
            <button type="submit" className="rts-btn btn-primary">
              Archive
            </button>
          </form>
        )}
      </div>

      <form action={updateAgentOverviewAction} className="spico-settings-form mt--20">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="agentId" value={agentId} />

        <div className="input-wrapper">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" defaultValue={agent.name} required disabled={!canUpdate} />
        </div>
        <div className="input-wrapper">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3} defaultValue={agent.description ?? ""} disabled={!canUpdate} />
        </div>
        <div className="input-wrapper">
          <label htmlFor="agentType">Agent type</label>
          <select id="agentType" name="agentType" defaultValue={agent.agent_type} disabled={!canUpdate}>
            <option value="receptionist">AI Receptionist</option>
            <option value="reservations">Reservations Agent</option>
            <option value="concierge">Concierge Agent</option>
            <option value="night">Night Agent</option>
            <option value="restaurant">Restaurant Agent</option>
            <option value="spa">Spa Agent</option>
            <option value="general_information">General Information Agent</option>
          </select>
        </div>
        <div className="input-wrapper">
          <label htmlFor="operatingMode">Operating mode</label>
          <select id="operatingMode" name="operatingMode" defaultValue={agent.operating_mode} disabled={!canUpdate}>
            <option value="manual_assist">Manual Assist — AI suggests only, human approves every action</option>
            <option value="semi_automatic">Semi-Automatic — AI auto-answers low-risk, requests approval for the rest</option>
            <option value="automatic">Automatic — AI may act on allowed actions (later milestones)</option>
          </select>
        </div>
        <div className="input-wrapper">
          <label htmlFor="greetingMessage">Greeting message</label>
          <textarea id="greetingMessage" name="greetingMessage" rows={2} defaultValue={agent.greeting_message ?? ""} disabled={!canUpdate} />
        </div>
        <div className="input-wrapper">
          <label htmlFor="fallbackMessage">Fallback message</label>
          <textarea id="fallbackMessage" name="fallbackMessage" rows={2} defaultValue={agent.fallback_message ?? ""} disabled={!canUpdate} />
        </div>
        <div className="input-wrapper">
          <label htmlFor="handoffMessage">Handoff message</label>
          <textarea id="handoffMessage" name="handoffMessage" rows={2} defaultValue={agent.handoff_message ?? ""} disabled={!canUpdate} />
        </div>
        <div className="input-wrapper">
          <label className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              name="knowledgeBaseEnabled"
              defaultChecked={agent.knowledge_base_enabled}
              disabled={!canUpdate}
            />
            <span className="form-check-label">Knowledge base enabled</span>
          </label>
          <p className="spico-muted">No knowledge base exists yet — see the recommended next milestone.</p>
        </div>
        <div className="input-wrapper">
          <label className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              name="testModeEnabled"
              defaultChecked={agent.test_mode_enabled}
              disabled={!canUpdate}
            />
            <span className="form-check-label">Test mode enabled</span>
          </label>
        </div>

        {canUpdate && (
          <button type="submit" className="rts-btn btn-primary mt--20">
            Save changes
          </button>
        )}
      </form>
    </div>
  );
}
