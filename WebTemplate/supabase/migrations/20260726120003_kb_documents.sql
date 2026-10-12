-- Uploaded files (stored in the private `kb-documents` Storage bucket, see
-- 20260726120005_kb_storage.sql) and externally-linked URLs. `processing_status`
-- models a future ingestion/embedding pipeline that does NOT exist yet in M4:
--   pending    -> row created, awaiting upload confirmation
--   processing -> reserved for the future chunk/embed pipeline (never set in M4)
--   ready      -> the file is stored and available as a raw source document
--                 (this does NOT mean it has been embedded or is retrievable by
--                  any RAG query — no such pipeline exists yet)
--   failed     -> upload or (future) processing failed; see processing_error
-- Storage path convention: '<hotel_id>/<document_id>/<original_filename>' — the
-- storage RLS policies key tenant access off the first path segment (hotel_id).

create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  hotel_id uuid not null references public.hotels (id) on delete cascade,
  category_id uuid references public.kb_categories (id) on delete set null,
  title text not null,
  description text,
  source_type text not null check (source_type in ('file', 'url')),
  storage_path text,
  file_name text,
  file_mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  source_url text,
  language_code text not null,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  processing_error text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint kb_documents_source_consistency check (
    (source_type = 'file' and storage_path is not null and source_url is null)
    or (source_type = 'url' and source_url is not null and storage_path is null)
  )
);

comment on table public.kb_documents is 'File- or URL-backed knowledge sources. No chunking/embedding/retrieval exists in M4 — processing_status=ready means "stored and available", not "vector-indexed".';

create index kb_documents_hotel_idx on public.kb_documents (hotel_id);
create index kb_documents_category_idx on public.kb_documents (category_id);
create index kb_documents_status_idx on public.kb_documents (status);
create index kb_documents_processing_idx on public.kb_documents (processing_status);

create trigger trg_kb_documents_set_updated_at
  before update on public.kb_documents
  for each row execute function public.set_updated_at();

alter table public.kb_documents enable row level security;

create policy "kb_documents_select_permission"
  on public.kb_documents for select
  using (public.has_permission(auth.uid(), 'kb.read', hotel_id, organization_id));

create policy "kb_documents_insert_permission"
  on public.kb_documents for insert
  to authenticated
  with check (public.has_permission(auth.uid(), 'kb.documents.manage', hotel_id, organization_id));

create policy "kb_documents_update_permission"
  on public.kb_documents for update
  using (public.has_permission(auth.uid(), 'kb.documents.manage', hotel_id, organization_id))
  with check (public.has_permission(auth.uid(), 'kb.documents.manage', hotel_id, organization_id));

create policy "kb_documents_delete_permission"
  on public.kb_documents for delete
  using (public.has_permission(auth.uid(), 'kb.documents.manage', hotel_id, organization_id));
