"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const languageCode = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Invalid language code");
const articleType = z.enum(["faq", "article", "policy", "snippet"]);

const baseFields = {
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  articleType,
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  summary: z.string().max(500).optional(),
  body: z.string().min(1, "Body is required").max(20000),
  languageCode,
  categoryId: z.string().optional(),
};

// A referenced category must belong to this hotel — a cross-table invariant the
// DB FK does not enforce (it only checks existence), so it is validated here,
// consistent with the other M3/M4 app-enforced cross-table checks.
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

function assertLanguageSupported(hotelLanguages: string[], code: string): void {
  if (hotelLanguages.length > 0 && !hotelLanguages.includes(code)) {
    throw new Error("Language must be one of the hotel's configured guest languages");
  }
}

const createSchema = z.object(baseFields);

export async function createArticleAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    articleType: formData.get("articleType"),
    title: formData.get("title"),
    summary: (formData.get("summary") as string | null)?.trim() || undefined,
    body: formData.get("body"),
    languageCode: formData.get("languageCode"),
    categoryId: (formData.get("categoryId") as string | null) || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.articles.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });
  assertLanguageSupported(hotel.languages, parsed.languageCode);

  const supabase = await createClient();
  const categoryId = await resolveCategoryId(supabase, hotel.id, parsed.categoryId);

  const { data: article, error } = await supabase
    .from("kb_articles")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      category_id: categoryId,
      article_type: parsed.articleType,
      title: parsed.title,
      summary: parsed.summary ?? null,
      body: parsed.body,
      language_code: parsed.languageCode,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !article) {
    await flash("error", error?.message ?? "Failed to create article");
    return;
  }

  await flash("success", `Article ${parsed.title} created`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.article.created",
    targetType: "kb_article",
    targetId: article.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { title: parsed.title, article_type: parsed.articleType, language_code: parsed.languageCode },
  });
}

const updateSchema = z.object({ ...baseFields, articleId: z.string().min(1) });

export async function updateArticleAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    articleId: formData.get("articleId"),
    articleType: formData.get("articleType"),
    title: formData.get("title"),
    summary: (formData.get("summary") as string | null)?.trim() || undefined,
    body: formData.get("body"),
    languageCode: formData.get("languageCode"),
    categoryId: (formData.get("categoryId") as string | null) || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.articles.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });
  assertLanguageSupported(hotel.languages, parsed.languageCode);

  const supabase = await createClient();
  const categoryId = await resolveCategoryId(supabase, hotel.id, parsed.categoryId);

  const { data: before } = await supabase
    .from("kb_articles")
    .select("title, article_type, summary, body, language_code, category_id")
    .eq("id", parsed.articleId)
    .single();

  const { data: updated, error } = await supabase
    .from("kb_articles")
    .update({
      category_id: categoryId,
      article_type: parsed.articleType,
      title: parsed.title,
      summary: parsed.summary ?? null,
      body: parsed.body,
      language_code: parsed.languageCode,
      updated_by: user.id,
    })
    .eq("id", parsed.articleId)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to update article");
    return;
  }

  await flash("success", `Article ${parsed.title} saved`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.article.updated",
    targetType: "kb_article",
    targetId: parsed.articleId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before,
    after: { title: parsed.title, article_type: parsed.articleType, language_code: parsed.languageCode },
  });
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  articleId: z.string().min(1),
  nextStatus: z.enum(["draft", "published", "archived"]),
});

export async function setArticleStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    articleId: formData.get("articleId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.articles.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("kb_articles")
    .update({ status: parsed.nextStatus, updated_by: user.id })
    .eq("id", parsed.articleId)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to change article status");
    return;
  }

  await flash(
    "success",
    parsed.nextStatus === "published" ? "Article published" : parsed.nextStatus === "archived" ? "Article archived" : "Article moved to draft",
  );

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.article.status_changed",
    targetType: "kb_article",
    targetId: parsed.articleId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: parsed.nextStatus },
  });
}
