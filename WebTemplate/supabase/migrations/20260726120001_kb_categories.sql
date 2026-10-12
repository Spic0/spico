-- Knowledge Base Foundation (Milestone 4). Per-hotel knowledge organized into
-- categories, hand-written articles, and uploaded/linked documents, plus a
-- per-agent assignment of which knowledge an agent may draw from. This is a
-- content + metadata foundation only: no chunking, embedding, vector index, or
-- retrieval/RAG execution exists anywhere in this schema or the code that reads
-- it. See docs/roadmap.md and docs/erd.md.

-- Categories group articles and documents within a single hotel. Hotel-scoped
-- and tenant-owned the same way departments are (org_id/hotel_id supplied by
-- the server action, not derived by trigger — this is not an ai_agent child).
create table public.kb_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (hotel_id, slug)
);

comment on table public.kb_categories is 'Per-hotel grouping for knowledge base articles and documents. Content foundation only — nothing is embedded or retrieved yet.';

create index kb_categories_hotel_idx on public.kb_categories (hotel_id);

create trigger trg_kb_categories_set_updated_at
  before update on public.kb_categories
  for each row execute function public.set_updated_at();

alter table public.kb_categories enable row level security;

create policy "kb_categories_select_permission"
  on public.kb_categories for select
  using (public.has_permission(auth.uid(), 'kb.read', hotel_id, organization_id));

create policy "kb_categories_insert_permission"
  on public.kb_categories for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'kb.categories.manage', hotel_id, organization_id));

create policy "kb_categories_update_permission"
  on public.kb_categories for update
  using (public.has_permission(auth.uid(), 'kb.categories.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'kb.categories.manage', hotel_id, organization_id));
