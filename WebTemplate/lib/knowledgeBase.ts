// Knowledge Base shared definitions (Milestone 4). Enum value sets, display
// labels, and the document upload constraints live here in code — used by
// every KB UI and validation path instead of being hardcoded per-page, the
// same registry pattern as lib/agentCapabilities.ts. Keep the value sets in
// sync with the CHECK constraints in supabase/migrations/2026072612000*.sql.
//
// M4 is a content + metadata foundation only: nothing here is embedded,
// chunked, vector-indexed, or retrieved by any live pipeline.

export type CategoryStatus = "active" | "archived";

export type ArticleType = "faq" | "article" | "policy" | "snippet";
export type ArticleStatus = "draft" | "published" | "archived";

export type DocumentSourceType = "file" | "url";
export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";
export type DocumentStatus = "active" | "archived";

export type KnowledgeSourceKind = "all" | "category" | "document" | "article";

export const ARTICLE_TYPES: { value: ArticleType; label: string }[] = [
  { value: "faq", label: "FAQ" },
  { value: "article", label: "Article" },
  { value: "policy", label: "Policy" },
  { value: "snippet", label: "Snippet" },
];

export const ARTICLE_STATUSES: ArticleStatus[] = ["draft", "published", "archived"];

export function articleTypeLabel(type: string): string {
  return ARTICLE_TYPES.find((t) => t.value === type)?.label ?? type;
}

// processing_status is a foundation for a future ingestion/embedding pipeline
// that does not exist yet. "ready" means the file is stored and available as a
// raw source — NOT that it has been embedded or is retrievable by any RAG query.
export const PROCESSING_STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: "Pending upload",
  processing: "Processing",
  ready: "Stored",
  failed: "Failed",
};

export function processingStatusLabel(status: string): string {
  return PROCESSING_STATUS_LABELS[status as ProcessingStatus] ?? status;
}

// Mirrors the kb-documents Storage bucket configuration (see
// 20260726120005_kb_storage.sql). Enforced again in the upload server action so
// a bad file is rejected before it ever reaches Storage.
export const KB_DOCUMENT_MAX_BYTES = 26214400; // 25 MiB

export interface AllowedFileType {
  mime: string;
  label: string;
  extensions: string[];
}

export const KB_ALLOWED_FILE_TYPES: AllowedFileType[] = [
  { mime: "application/pdf", label: "PDF", extensions: [".pdf"] },
  { mime: "text/plain", label: "Text", extensions: [".txt"] },
  { mime: "text/markdown", label: "Markdown", extensions: [".md", ".markdown"] },
  { mime: "text/csv", label: "CSV", extensions: [".csv"] },
  { mime: "application/msword", label: "Word (.doc)", extensions: [".doc"] },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word (.docx)",
    extensions: [".docx"],
  },
];

export const KB_ALLOWED_MIME_TYPES = KB_ALLOWED_FILE_TYPES.map((t) => t.mime);

export const KB_ALLOWED_FILE_ACCEPT = KB_ALLOWED_FILE_TYPES.flatMap((t) => t.extensions).join(",");

export function isAllowedKbMimeType(mime: string): boolean {
  return KB_ALLOWED_MIME_TYPES.includes(mime);
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
