-- Which knowledge an AI agent may draw from. This is the table that finally
-- gives ai_agents.knowledge_base_enabled (added in M3, unused until now)
-- something concrete to point at. Assignment/metadata only — no retrieval runs.
--
-- source_kind semantics:
--   all       -> the whole hotel's knowledge base (no specific target row)
--   category  -> everything in one kb_categories row
--   document  -> one specific kb_documents row
--   article   -> one specific kb_articles row
-- Cross-table sameness (the referenced category/document/article belongs to the
-- same hotel as the agent) is validated in the server action, consistent with
-- the other M3 app-enforced cross-table invariants (see docs/assumptions.md).

create table public.ai_agent_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  agent_id uuid not null references public.ai_agents (id) on delete cascade,
  source_kind text not null check (source_kind in ('all', 'category', 'document', 'article')),
  category_id uuid references public.kb_categories (id) on delete cascade,
  document_id uuid references public.kb_documents (id) on delete cascade,
  article_id uuid references public.kb_articles (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint aaks_target_consistency check (
    (source_kind = 'all' and category_id is null and document_id is null and article_id is null)
    or (source_kind = 'category' and category_id is not null and document_id is null and article_id is null)
    or (source_kind = 'document' and document_id is not null and category_id is null and article_id is null)
    or (source_kind = 'article' and article_id is not null and category_id is null and document_id is null)
  )
);

comment on table public.ai_agent_knowledge_sources is 'Per-agent knowledge assignment. Consumes ai_agents.knowledge_base_enabled. Assignment metadata only — no retrieval/RAG runs in M4.';

create index ai_agent_knowledge_sources_agent_idx on public.ai_agent_knowledge_sources (agent_id);
create index ai_agent_knowledge_sources_hotel_idx on public.ai_agent_knowledge_sources (hotel_id);

-- Prevent duplicate assignments. Partial unique indexes: at most one "all" row
-- per agent, and any specific target may be assigned to an agent only once.
create unique index aaks_one_all_per_agent on public.ai_agent_knowledge_sources (agent_id) where (source_kind = 'all');
create unique index aaks_unique_category on public.ai_agent_knowledge_sources (agent_id, category_id) where (category_id is not null);
create unique index aaks_unique_document on public.ai_agent_knowledge_sources (agent_id, document_id) where (document_id is not null);
create unique index aaks_unique_article on public.ai_agent_knowledge_sources (agent_id, article_id) where (article_id is not null);

-- Derives organization_id/hotel_id from the parent agent, same shared trigger
-- every ai_agent_* child table uses.
create trigger trg_ai_agent_knowledge_sources_set_scope
  before insert on public.ai_agent_knowledge_sources
  for each row execute function public.set_ai_agent_child_scope();

alter table public.ai_agent_knowledge_sources enable row level security;

create policy "aaks_select_permission"
  on public.ai_agent_knowledge_sources for select
  using (public.has_permission(auth.uid(), 'ai_agents.read', hotel_id, organization_id));

create policy "aaks_insert_permission"
  on public.ai_agent_knowledge_sources for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'ai_agents.manage_knowledge', hotel_id, organization_id));

create policy "aaks_delete_permission"
  on public.ai_agent_knowledge_sources for delete
  using (public.has_permission(auth.uid(), 'ai_agents.manage_knowledge', hotel_id, organization_id));
