import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { languageLabel } from "@/lib/languages";
import { ARTICLE_TYPES, articleTypeLabel } from "@/lib/knowledgeBase";
import { StatusChip } from "@/components/ui/StatusChip";
import { createArticleAction, updateArticleAction, setArticleStatusAction } from "./actions";

export default async function KbArticlesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("kb.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "kb.articles.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const [{ data: articles, error }, { data: categories }] = await Promise.all([
    supabase
      .from("kb_articles")
      .select("id, title, summary, body, article_type, language_code, status, category_id")
      .eq("hotel_id", hotel.id)
      .order("created_at", { ascending: false }),
    supabase.from("kb_categories").select("id, name, status").eq("hotel_id", hotel.id).order("name"),
  ]);

  if (error) {
    throw new Error(`Failed to load articles: ${error.message}`);
  }

  const languageOptions = hotel.languages.length > 0 ? hotel.languages : [hotel.default_locale];
  const categoryList = categories ?? [];
  const categoryName = (id: string | null) => (id ? categoryList.find((c) => c.id === id)?.name ?? "—" : "—");
  const defaultLanguage = hotel.default_guest_language ?? languageOptions[0];

  return (
    <div className="mt--20">
      <p className="spico-muted">
        Hand-written FAQ entries, policies, and articles. Authored content only — nothing is embedded or retrieved yet.
      </p>

      {(articles ?? []).length === 0 && <p>No articles yet.</p>}

      {(articles ?? []).map((article) => (
        <div className="spico-panel mt--20" key={article.id}>
          {canManage ? (
            <form action={updateArticleAction}>
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <input type="hidden" name="articleId" value={article.id} />
              <div className="input-wrapper">
                <input name="title" type="text" defaultValue={article.title} required maxLength={200} />
              </div>
              <div className="spico-inline-form">
                <select name="articleType" defaultValue={article.article_type}>
                  {ARTICLE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select name="languageCode" defaultValue={article.language_code}>
                  {languageOptions.map((code) => (
                    <option key={code} value={code}>
                      {languageLabel(code)}
                    </option>
                  ))}
                </select>
                <select name="categoryId" defaultValue={article.category_id ?? ""}>
                  <option value="">No category</option>
                  {categoryList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-wrapper">
                <input
                  name="summary"
                  type="text"
                  defaultValue={article.summary ?? ""}
                  placeholder="Summary (optional)"
                  maxLength={500}
                />
              </div>
              <div className="input-wrapper">
                <textarea name="body" rows={5} defaultValue={article.body} required maxLength={20000} />
              </div>
              <button type="submit" className="rts-btn btn-primary">
                Save
              </button>
            </form>
          ) : (
            <>
              <strong>{article.title}</strong>
              <p className="spico-muted">
                {articleTypeLabel(article.article_type)} · {languageLabel(article.language_code)} ·{" "}
                {categoryName(article.category_id)}
              </p>
              {article.summary && <p>{article.summary}</p>}
              <p>{article.body}</p>
            </>
          )}

          <p className="mt--10" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span className="spico-muted">Status:</span> <StatusChip status={article.status} />
          </p>

          {canManage && (
            <div className="spico-inline-form">
              {article.status !== "published" && (
                <StatusButton
                  orgSlug={orgSlug}
                  hotelSlug={hotelSlug}
                  articleId={article.id}
                  nextStatus="published"
                  label="Publish"
                />
              )}
              {article.status !== "draft" && (
                <StatusButton
                  orgSlug={orgSlug}
                  hotelSlug={hotelSlug}
                  articleId={article.id}
                  nextStatus="draft"
                  label="Move to draft"
                />
              )}
              {article.status !== "archived" && (
                <StatusButton
                  orgSlug={orgSlug}
                  hotelSlug={hotelSlug}
                  articleId={article.id}
                  nextStatus="archived"
                  label="Archive"
                />
              )}
            </div>
          )}
        </div>
      ))}

      {canManage && (
        <>
          <h5 className="title mt--30">Add an article</h5>
          <form action={createArticleAction} className="spico-panel">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <div className="input-wrapper">
              <label className="visually-hidden" htmlFor="art-title">
                Title
              </label>
              <input id="art-title" name="title" type="text" placeholder="Title / question" required maxLength={200} />
            </div>
            <div className="spico-inline-form">
              <select name="articleType" defaultValue="faq" aria-label="Type">
                {ARTICLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
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
              <label className="visually-hidden" htmlFor="art-summary">
                Summary
              </label>
              <input id="art-summary" name="summary" type="text" placeholder="Summary (optional)" maxLength={500} />
            </div>
            <div className="input-wrapper">
              <label className="visually-hidden" htmlFor="art-body">
                Body
              </label>
              <textarea id="art-body" name="body" rows={5} placeholder="Answer / content" required maxLength={20000} />
            </div>
            <button type="submit" className="rts-btn btn-primary">
              Add article
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function StatusButton({
  orgSlug,
  hotelSlug,
  articleId,
  nextStatus,
  label,
}: {
  orgSlug: string;
  hotelSlug: string;
  articleId: string;
  nextStatus: "draft" | "published" | "archived";
  label: string;
}) {
  return (
    <form action={setArticleStatusAction}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <button type="submit" className="rts-btn btn-secondary btn-sm">
        {label}
      </button>
    </form>
  );
}
