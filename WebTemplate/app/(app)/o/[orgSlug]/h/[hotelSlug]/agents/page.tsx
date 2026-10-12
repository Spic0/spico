import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/StatusChip";

export default async function AgentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });
  const canCreate = await hasPermission(user.id, "ai_agents.create", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: agents, error } = await supabase
    .from("ai_agents")
    .select("id, name, agent_type, status, operating_mode")
    .eq("hotel_id", hotel.id)
    .order("name");

  if (error) {
    throw new Error(`Failed to load AI agents: ${error.message}`);
  }

  return (
    <div className="pt--40">
      <h4 className="title">{hotel.name} — AI Agents</h4>
      <p className="spico-muted">
        Configuration and policy only — no agent here places calls, sends messages, or contacts guests yet.
      </p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Operating mode</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(agents ?? []).map((agent) => (
            <tr key={agent.id}>
              <td>{agent.name}</td>
              <td style={{ textTransform: "capitalize" }}>{agent.agent_type.replace("_", " ")}</td>
              <td>
                <StatusChip status={agent.status} />
              </td>
              <td style={{ textTransform: "capitalize" }}>{agent.operating_mode.replace("_", " ")}</td>
              <td>
                <Link href={`/o/${organization.slug}/h/${hotel.slug}/agents/${agent.id}`} className="rts-btn btn-primary">
                  Open
                </Link>
              </td>
            </tr>
          ))}
          {(agents ?? []).length === 0 && (
            <tr>
              <td colSpan={5}>No AI agents yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canCreate && (
        <p className="mt--20">
          <Link href={`/o/${organization.slug}/h/${hotel.slug}/agents/new`} className="rts-btn btn-primary">
            Create AI agent
          </Link>
        </p>
      )}
    </div>
  );
}
