import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { languageLabel } from "@/lib/languages";
import { KB_ALLOWED_FILE_ACCEPT, formatFileSize } from "@/lib/knowledgeBase";
import { StatusChip } from "@/components/ui/StatusChip";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import {
  uploadDocumentFileAction,
  addDocumentUrlAction,
  setDocumentStatusAction,
  deleteDocumentAction,
} from "./actions";

const KB_BUCKET = "kb-documents";

export default async function KbDocumentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("kb.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "kb.documents.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const [{ data: documents, error }, { data: categories }] = await Promise.all([
    supabase
      .from("kb_documents")
      .select(
        "id, title, description, source_type, storage_path, file_name, file_size_bytes, source_url, language_code, processing_status, status, category_id",
      )
      .eq("hotel_id", hotel.id)
      .order("created_at", { ascending: false }),
    supabase.from("kb_categories").select("id, name, status").eq("hotel_id", hotel.id).order("name"),
  ]);

  if (error) {
    throw new Error(`Failed to load documents: ${error.message}`);
  }

  const docs = documents ?? [];
  const categoryList = categories ?? [];
  const categoryName = (id: string | null) => (id ? categoryList.find((c) => c.id === id)?.name ?? "—" : "—");
  const languageOptions = hotel.languages.length > 0 ? hotel.languages : [hotel.default_locale];
  const defaultLanguage = hotel.default_guest_language ?? languageOptions[0];

  // Short-lived signed URLs so uploaded files can actually be opened.
  const signedUrlByDoc = new Map<string, string>();
  await Promise.all(
    docs
      .filter((d) => d.source_type === "file" && d.storage_path)
      .map(async (d) => {
        const { data } = await supabase.storage.from(KB_BUCKET).createSignedUrl(d.storage_path as string, 300);
        if (data?.signedUrl) signedUrlByDoc.set(d.id, data.signedUrl);
      }),
  );

  return (
    <div className="mt--20">
      <p className="spico-muted">
        Uploaded files and external links. Files are stored privately; &quot;Stored&quot; means available as a raw
        source — no chunking, embedding, or retrieval runs yet (that pipeline ships in a later milestone).
      </p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Source</th>
            <th>Category</th>
            <th>Language</th>
            <th>State</th>
            <th>Status</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id}>
              <td>
                {doc.title}
                {doc.description && <div className="spico-muted">{doc.description}</div>}
              </td>
              <td>
                {doc.source_type === "file" ? (
                  signedUrlByDoc.has(doc.id) ? (
                    <a href={signedUrlByDoc.get(doc.id)} target="_blank" rel="noreferrer">
                      {doc.file_name} <span className="spico-muted">({formatFileSize(doc.file_size_bytes)})</span>
                    </a>
                  ) : (
                    <span>
                      {doc.file_name} <span className="spico-muted">({formatFileSize(doc.file_size_bytes)})</span>
                    </span>
                  )
                ) : (
                  <a href={doc.source_url ?? "#"} target="_blank" rel="noreferrer">
                    External link
                  </a>
                )}
              </td>
              <td>{categoryName(doc.category_id)}</td>
              <td>{languageLabel(doc.language_code)}</td>
              <td>
                <StatusChip status={doc.processing_status} />
              </td>
              <td>
                <StatusChip status={doc.status} />
              </td>
              {canManage && (
                <td>
                  <div className="spico-inline-form">
                    <form action={setDocumentStatusAction}>
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="hotelSlug" value={hotelSlug} />
                      <input type="hidden" name="documentId" value={doc.id} />
                      <input type="hidden" name="nextStatus" value={doc.status === "active" ? "archived" : "active"} />
                      <button type="submit" className="rts-btn btn-secondary btn-sm">
                        {doc.status === "active" ? "Archive" : "Restore"}
                      </button>
                    </form>
                    <form action={deleteDocumentAction}>
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="hotelSlug" value={hotelSlug} />
                      <input type="hidden" name="documentId" value={doc.id} />
                      <ConfirmSubmitButton
                        confirmMessage="Permanently delete this document? It will be removed from the knowledge base and any stored file deleted. This cannot be undone."
                        pendingLabel="Deleting…"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {docs.length === 0 && (
            <tr>
              <td colSpan={canManage ? 7 : 6}>No documents yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <div className="spico-two-col mt--30">
          <div>
            <h5 className="title">Upload a file</h5>
            <form action={uploadDocumentFileAction} encType="multipart/form-data" className="spico-panel">
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <div className="input-wrapper">
                <label htmlFor="doc-title">Title</label>
                <input id="doc-title" name="title" type="text" placeholder="Document title" required maxLength={200} />
              </div>
              <div className="input-wrapper">
                <label htmlFor="doc-file">File (PDF, TXT, MD, CSV, DOC, DOCX · max 25 MB)</label>
                <input id="doc-file" name="file" type="file" accept={KB_ALLOWED_FILE_ACCEPT} required />
              </div>
              <div className="spico-inline-form">
                <select name="languageCode" defaultValue={defaultLanguage} aria-label="Language">
                  {languageOptions.map((code) => (
                    <option key={code} value={code}>
                      {languageLabel(code)}
                    </option>
                  ))}
                </select>
                <select name="categoryId" defaultValue="" aria-label="Category">
                  <option value="">No category</option>
                  {categoryList
                    .filter((c) => c.status === "active")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="input-wrapper">
                <input name="description" type="text" placeholder="Description (optional)" maxLength={1000} />
              </div>
              <button type="submit" className="rts-btn btn-primary">
                Upload
              </button>
            </form>
          </div>

          <div>
            <h5 className="title">Link an external URL</h5>
            <form action={addDocumentUrlAction} className="spico-panel">
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <div className="input-wrapper">
                <label htmlFor="url-title">Title</label>
                <input id="url-title" name="title" type="text" placeholder="Resource title" required maxLength={200} />
              </div>
              <div className="input-wrapper">
                <label htmlFor="url-source">URL</label>
                <input id="url-source" name="sourceUrl" type="url" placeholder="https://…" required maxLength={2000} />
              </div>
              <div className="spico-inline-form">
                <select name="languageCode" defaultValue={defaultLanguage} aria-label="Language">
                  {languageOptions.map((code) => (
                    <option key={code} value={code}>
                      {languageLabel(code)}
                    </option>
                  ))}
                </select>
                <select name="categoryId" defaultValue="" aria-label="Category">
                  <option value="">No category</option>
                  {categoryList
                    .filter((c) => c.status === "active")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="input-wrapper">
                <input name="description" type="text" placeholder="Description (optional)" maxLength={1000} />
              </div>
              <button type="submit" className="rts-btn btn-primary">
                Add link
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
