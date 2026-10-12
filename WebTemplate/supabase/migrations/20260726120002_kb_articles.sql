-- Hand-written knowledge: FAQ entries, policy text, and free-form articles.
-- The body is plain text/markdown stored as-is; no rendering pipeline, no
-- embedding, no retrieval — this is authored source content only.

create table public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  category_id uuid references public.kb_categories (id) on delete set null,
  article_type text not null default 'faq' check (article_type in ('faq', 'article', 'policy', 'snippet')),
  title text not null,
  summary text,
  body text not null,
  language_code text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.kb_articles is 'Hand-authored knowledge (FAQ/policy/article/snippet). Content only — never embedded or retrieved by any live pipeline in M4.';

create index kb_articles_hotel_idx on public.kb_articles (hotel_id);
create index kb_articles_category_idx on public.kb_articles (category_id);
create index kb_articles_status_idx on public.kb_articles (status);

create trigger trg_kb_articles_set_updated_at
  before update on public.kb_articles
  for each row execute function public.set_updated_at();

alter table public.kb_articles enable row level security;

create policy "kb_articles_select_permission"
  on public.kb_articles for select
  using (public.has_permission(auth.uid(), 'kb.read', hotel_id, organization_id));

create policy "kb_articles_insert_permission"
  on public.kb_articles for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'kb.articles.manage', hotel_id, organization_id));

create policy "kb_articles_update_permission"
  on public.kb_articles for update
  using (public.has_permission(auth.uid(), 'kb.articles.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'kb.articles.manage', hotel_id, organization_id));
