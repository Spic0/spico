import type { ReactNode } from "react";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { TabNav } from "@/components/layout/TabNav";

export default async function AgentDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, agentId);
  await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });

  const base = `/o/${organization.slug}/h/${hotel.slug}/agents/${agent.id}`;

  return (
    <div className="pt--40">
      <h4 className="title">
        {agent.name} <span className="spico-muted">· {agent.status}</span>
      </h4>
      <TabNav
        items={[
          { href: base, label: "Overview" },
          { href: `${base}/languages`, label: "Languages" },
          { href: `${base}/capabilities`, label: "Capabilities" },
          { href: `${base}/schedule`, label: "Schedule and Handoff" },
          { href: `${base}/policy`, label: "Approval Policy" },
          { href: `${base}/prompt`, label: "Prompt and Versions" },
          { href: `${base}/knowledge`, label: "Knowledge" },
          { href: `${base}/test`, label: "Test Playground" },
        ]}
      />
      {children}
    </div>
  );
}
