-- Private Storage bucket for knowledge base document files, plus tenant-scoped
-- RLS on storage.objects. Access is keyed off the FIRST path segment of the
-- object name, which is the hotel_id (path convention:
-- '<hotel_id>/<document_id>/<original_filename>', enforced by the upload server
-- action). Same permission model as the kb_documents table: kb.read to read,
-- kb.documents.manage to write/delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kb-documents',
  'kb-documents',
  false,
  26214400, -- 25 MiB
  array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy "kb_documents_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kb-documents'
    and public.has_permission(auth.uid(), 'kb.read', ((storage.foldername(name))[1])::uuid, null)
  );

create policy "kb_documents_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kb-documents'
    and public.has_permission(auth.uid(), 'kb.documents.manage', ((storage.foldername(name))[1])::uuid, null)
  );

create policy "kb_documents_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kb-documents'
    and public.has_permission(auth.uid(), 'kb.documents.manage', ((storage.foldername(name))[1])::uuid, null)
  )
  with check (
    bucket_id = 'kb-documents'
    and public.has_permission(auth.uid(), 'kb.documents.manage', ((storage.foldername(name))[1])::uuid, null)
  );

create policy "kb_documents_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kb-documents'
    and public.has_permission(auth.uid(), 'kb.documents.manage', ((storage.foldername(name))[1])::uuid, null)
  );
