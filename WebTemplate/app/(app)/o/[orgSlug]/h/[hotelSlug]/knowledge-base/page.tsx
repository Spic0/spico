import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";

export default async function KnowledgeBaseOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("kb.read", { hotelId: hotel.id, organizationId: organization.id });
  const canViewAgents = await hasPermission(user.id, "ai_agents.read", { hotelId: hotel.id });

  const supabase = await createClient();
  const [
    { count: categoryCount },
    { count: articleCount },
    { count: publishedCount },
    { count: documentCount },
    { count: readyCount },
  ] = await Promise.all([
    supabase
      .from("kb_categories")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("status", "active"),
    supabase.from("kb_articles").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id),
    supabase
      .from("kb_articles")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("status", "published"),
    supabase.from("kb_documents").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id),
    supabase
      .from("kb_documents")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("processing_status", "ready"),
  ]);

  const agentsUsingKb = canViewAgents
    ? await supabase
        .from("ai_agents")
        .select("id, name, knowledge_base_enabled")
        .eq("hotel_id", hotel.id)
        .eq("knowledge_base_enabled", true)
    : { data: [] };

  return (
    <div className="mt--20">
      <div className="spico-kpi-row">
        <div className="spico-kpi-card">
          <span className="spico-kpi-value">{categoryCount ?? 0}</span>
          <span className="spico-kpi-label">Active categories</span>
        </div>
        <div className="spico-kpi-card">
          <span className="spico-kpi-value">{articleCount ?? 0}</span>
          <span className="spico-kpi-label">Articles ({publishedCount ?? 0} published)</span>
        </div>
        <div className="spico-kpi-card">
          <span className="spico-kpi-value">{documentCount ?? 0}</span>
          <span className="spico-kpi-label">Documents ({readyCount ?? 0} stored)</span>
        </div>
      </div>

      <div className="spico-panel mt--20">
        <strong>Foundation only.</strong>
        <p className="spico-muted">
          This milestone stores and organizes hotel knowledge. It does not yet chunk, embed, or retrieve any of it —
          &quot;stored&quot; documents are saved raw, not vector-indexed. AI agents can already be pointed at this
          knowledge (see an agent&apos;s Knowledge tab); a live retrieval pipeline connects it in a later milestone.
        </p>
      </div>

      {canViewAgents && (
        <>
          <h5 className="title mt--30">Agents with knowledge base enabled</h5>
          {(agentsUsingKb.data ?? []).length === 0 ? (
            <p className="spico-muted">
              No agents have the knowledge base enabled yet. Enable it on an agent&apos;s Overview, then assign sources
              on its Knowledge tab.
            </p>
          ) : (
            <ul className="spico-plain-list">
              {(agentsUsingKb.data ?? []).map((agent) => (
                <li key={agent.id}>{agent.name}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
