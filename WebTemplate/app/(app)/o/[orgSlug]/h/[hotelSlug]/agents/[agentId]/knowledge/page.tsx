import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import {
  toggleAgentKnowledgeAction,
  addAgentKnowledgeSourceAction,
  removeAgentKnowledgeSourceAction,
} from "./actions";

export default async function AgentKnowledgePage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, agentId);
  const user = await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });
  const [canAssign, canToggle] = await Promise.all([
    hasPermission(user.id, "ai_agents.manage_knowledge", { hotelId: hotel.id }),
    hasPermission(user.id, "ai_agents.update", { hotelId: hotel.id }),
  ]);

  const supabase = await createClient();
  const [{ data: sources }, { data: categories }, { data: documents }, { data: articles }] = await Promise.all([
    supabase
      .from("ai_agent_knowledge_sources")
      .select("id, source_kind, category_id, document_id, article_id, created_at")
      .eq("agent_id", agent.id)
      .order("created_at"),
    supabase.from("kb_categories").select("id, name").eq("hotel_id", hotel.id).eq("status", "active").order("name"),
    supabase.from("kb_documents").select("id, title").eq("hotel_id", hotel.id).eq("status", "active").order("title"),
    supabase
      .from("kb_articles")
      .select("id, title")
      .eq("hotel_id", hotel.id)
      .neq("status", "archived")
      .order("title"),
  ]);

  const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const documentName = new Map((documents ?? []).map((d) => [d.id, d.title]));
  const articleName = new Map((articles ?? []).map((a) => [a.id, a.title]));

  const describeSource = (s: {
    source_kind: string;
    category_id: string | null;
    document_id: string | null;
    article_id: string | null;
  }) => {
    if (s.source_kind === "all") return "Entire knowledge base";
    if (s.source_kind === "category") return `Category: ${categoryName.get(s.category_id ?? "") ?? "(removed)"}`;
    if (s.source_kind === "document") return `Document: ${documentName.get(s.document_id ?? "") ?? "(removed)"}`;
    if (s.source_kind === "article") return `Article: ${articleName.get(s.article_id ?? "") ?? "(removed)"}`;
    return s.source_kind;
  };

  const sourceList = sources ?? [];
  const hasAllSource = sourceList.some((s) => s.source_kind === "all");

  return (
    <div className="mt--20">
      <div className="spico-panel">
        <strong>Knowledge base</strong>{" "}
        <span className={agent.knowledge_base_enabled ? "spico-badge-active" : "spico-muted"}>
          {agent.knowledge_base_enabled ? "Enabled" : "Disabled"}
        </span>
        <p className="spico-muted">
          Assigning sources records which hotel knowledge this agent may draw from. No retrieval runs yet — this
          connects to a live pipeline in a later milestone.
        </p>
        {canToggle && (
          <form action={toggleAgentKnowledgeAction}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="agentId" value={agent.id} />
            <input type="hidden" name="enabled" value={agent.knowledge_base_enabled ? "false" : "true"} />
            <button type="submit" className="rts-btn btn-primary">
              {agent.knowledge_base_enabled ? "Disable knowledge base" : "Enable knowledge base"}
            </button>
          </form>
        )}
      </div>

      <h5 className="title mt--30">Assigned sources</h5>
      <table className="spico-table">
        <thead>
          <tr>
            <th>Source</th>
            {canAssign && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {sourceList.map((s) => (
            <tr key={s.id}>
              <td>{describeSource(s)}</td>
              {canAssign && (
                <td>
                  <form action={removeAgentKnowledgeSourceAction}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="agentId" value={agent.id} />
                    <input type="hidden" name="sourceId" value={s.id} />
                    <ConfirmSubmitButton
                      confirmMessage="Remove this knowledge source from the agent? The agent will no longer use it to answer."
                      pendingLabel="Removing…"
                    >
                      Remove
                    </ConfirmSubmitButton>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {sourceList.length === 0 && (
            <tr>
              <td colSpan={canAssign ? 2 : 1}>No sources assigned yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canAssign && (
        <>
          <h5 className="title mt--30">Add a source</h5>

          {!hasAllSource && (
            <form action={addAgentKnowledgeSourceAction} className="mb--10">
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <input type="hidden" name="agentId" value={agent.id} />
              <input type="hidden" name="sourceKind" value="all" />
              <button type="submit" className="rts-btn btn-primary">
                Use the entire knowledge base
              </button>
            </form>
          )}

          <form action={addAgentKnowledgeSourceAction} className="spico-inline-form">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="agentId" value={agent.id} />
            <input type="hidden" name="sourceKind" value="category" />
            <select name="categoryId" aria-label="Category" required>
              <option value="">Select a category…</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rts-btn btn-primary">
              Add category
            </button>
          </form>

          <form action={addAgentKnowledgeSourceAction} className="spico-inline-form">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="agentId" value={agent.id} />
            <input type="hidden" name="sourceKind" value="document" />
            <select name="documentId" aria-label="Document" required>
              <option value="">Select a document…</option>
              {(documents ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            <button type="submit" className="rts-btn btn-primary">
              Add document
            </button>
          </form>

          <form action={addAgentKnowledgeSourceAction} className="spico-inline-form">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="agentId" value={agent.id} />
            <input type="hidden" name="sourceKind" value="article" />
            <select name="articleId" aria-label="Article" required>
              <option value="">Select an article…</option>
              {(articles ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
            <button type="submit" className="rts-btn btn-primary">
              Add article
            </button>
          </form>
        </>
      )}
    </div>
  );
}
