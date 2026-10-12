"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { KB_DOCUMENT_MAX_BYTES, isAllowedKbMimeType } from "@/lib/knowledgeBase";
import { flash } from "@/lib/flash";

const KB_BUCKET = "kb-documents";
const languageCode = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Invalid language code");

async function resolveCategoryId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hotelId: string,
  rawCategoryId: string | undefined,
): Promise<string | null> {
  if (!rawCategoryId) return null;
  const { data } = await supabase
    .from("kb_categories")
    .select("id")
    .eq("id", rawCategoryId)
    .eq("hotel_id", hotelId)
    .single();
  if (!data) {
    throw new Error("Selected category does not belong to this hotel");
  }
  return data.id;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_");
  return cleaned.slice(0, 120) || "document";
}

const uploadSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  description: z.string().max(1000).optional(),
  languageCode,
  categoryId: z.string().optional(),
});

export async function uploadDocumentFileAction(formData: FormData): Promise<void> {
  const result = uploadSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    title: formData.get("title"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
    languageCode: formData.get("languageCode"),
    categoryId: (formData.get("categoryId") as string | null) || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    await flash("error", "Please choose a file to upload");
    return;
  }
  if (file.size > KB_DOCUMENT_MAX_BYTES) {
    await flash("error", "File exceeds the 25 MB limit");
    return;
  }
  if (!isAllowedKbMimeType(file.type)) {
    await flash("error", "Unsupported file type. Allowed: PDF, TXT, Markdown, CSV, DOC, DOCX");
    return;
  }

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.documents.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const categoryId = await resolveCategoryId(supabase, hotel.id, parsed.categoryId);

  // Upload first so the DB row only ever exists if the file does. Path keys the
  // storage RLS off the hotel_id (first segment) — see the storage migration.
  const documentId = randomUUID();
  const safeName = sanitizeFileName(file.name);
  const storagePath = `${hotel.id}/${documentId}/${safeName}`;

  const { error: uploadError } = await supabase.storage.from(KB_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    await flash("error", `Upload failed: ${uploadError.message}`);
    return;
  }

  const { data: document, error } = await supabase
    .from("kb_documents")
    .insert({
      id: documentId,
      organization_id: organization.id,
      hotel_id: hotel.id,
      category_id: categoryId,
      title: parsed.title,
      description: parsed.description ?? null,
      source_type: "file",
      storage_path: storagePath,
      file_name: safeName,
      file_mime_type: file.type,
      file_size_bytes: file.size,
      language_code: parsed.languageCode,
      // "ready" = stored and available as a raw source. No embedding/retrieval
      // pipeline exists in M4 — see lib/knowledgeBase.ts / docs/roadmap.md.
      processing_status: "ready",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !document) {
    // Roll back the orphaned object so we never leave a file with no record.
    await supabase.storage.from(KB_BUCKET).remove([storagePath]);
    await flash("error", error?.message ?? "Failed to save document record");
    return;
  }

  await flash("success", `Document ${parsed.title} uploaded`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.document.uploaded",
    targetType: "kb_document",
    targetId: document.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { title: parsed.title, file_name: safeName, file_size_bytes: file.size },
  });
}

const urlSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  description: z.string().max(1000).optional(),
  languageCode,
  categoryId: z.string().optional(),
  sourceUrl: z.string().regex(/^https?:\/\/.+/i, "Enter a valid http(s) URL").max(2000),
});

export async function addDocumentUrlAction(formData: FormData): Promise<void> {
  const result = urlSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    title: formData.get("title"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
    languageCode: formData.get("languageCode"),
    categoryId: (formData.get("categoryId") as string | null) || undefined,
    sourceUrl: formData.get("sourceUrl"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.documents.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const categoryId = await resolveCategoryId(supabase, hotel.id, parsed.categoryId);

  const { data: document, error } = await supabase
    .from("kb_documents")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      category_id: categoryId,
      title: parsed.title,
      description: parsed.description ?? null,
      source_type: "url",
      source_url: parsed.sourceUrl,
      language_code: parsed.languageCode,
      processing_status: "ready",
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !document) {
    await flash("error", error?.message ?? "Failed to save document link");
    return;
  }

  await flash("success", `Document ${parsed.title} linked`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.document.linked",
    targetType: "kb_document",
    targetId: document.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { title: parsed.title, source_url: parsed.sourceUrl },
  });
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  documentId: z.string().min(1),
  nextStatus: z.enum(["active", "archived"]),
});

export async function setDocumentStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    documentId: formData.get("documentId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.documents.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("kb_documents")
    .update({ status: parsed.nextStatus, updated_by: user.id })
    .eq("id", parsed.documentId)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to change document status");
    return;
  }

  await flash("success", parsed.nextStatus === "active" ? "Document restored" : "Document archived");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.document.status_changed",
    targetType: "kb_document",
    targetId: parsed.documentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: parsed.nextStatus },
  });
}

const deleteSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  documentId: z.string().min(1),
});

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const result = deleteSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    documentId: formData.get("documentId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.documents.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("kb_documents")
    .select("title, source_type, storage_path")
    .eq("id", parsed.documentId)
    .single();

  // Delete the authoritative record first, then best-effort remove the stored
  // object — a leftover object is harmless, a row pointing at a missing file is not.
  const { data: deleted, error } = await supabase
    .from("kb_documents")
    .delete()
    .eq("id", parsed.documentId)
    .select("id")
    .single();

  if (error || !deleted) {
    await flash("error", error?.message ?? "Failed to delete document");
    return;
  }

  await flash("success", "Document deleted");

  if (before?.source_type === "file" && before.storage_path) {
    await supabase.storage.from(KB_BUCKET).remove([before.storage_path]);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.document.deleted",
    targetType: "kb_document",
    targetId: parsed.documentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before,
  });
}
