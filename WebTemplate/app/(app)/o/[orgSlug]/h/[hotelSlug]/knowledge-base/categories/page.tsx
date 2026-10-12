import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/StatusChip";
import { createCategoryAction, updateCategoryAction, setCategoryStatusAction } from "./actions";

export default async function KbCategoriesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("kb.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "kb.categories.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from("kb_categories")
    .select("id, name, slug, description, status")
    .eq("hotel_id", hotel.id)
    .order("name");

  if (error) {
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  return (
    <div className="mt--20">
      <p className="spico-muted">
        Categories group articles and documents. They organize content only — nothing is embedded or retrieved yet.
      </p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Status</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(categories ?? []).map((category) => (
            <tr key={category.id}>
              {canManage ? (
                <td colSpan={2}>
                  <form action={updateCategoryAction} className="spico-inline-form">
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="categoryId" value={category.id} />
                    <input name="name" type="text" defaultValue={category.name} required />
                    <input
                      name="description"
                      type="text"
                      defaultValue={category.description ?? ""}
                      placeholder="Description"
                    />
                    <button type="submit" className="rts-btn btn-primary">
                      Save
                    </button>
                  </form>
                </td>
              ) : (
                <>
                  <td>{category.name}</td>
                  <td>{category.description ?? ""}</td>
                </>
              )}
              <td>
                <StatusChip status={category.status} />
              </td>
              {canManage && (
                <td>
                  <form action={setCategoryStatusAction}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="categoryId" value={category.id} />
                    <input
                      type="hidden"
                      name="nextStatus"
                      value={category.status === "active" ? "archived" : "active"}
                    />
                    <button type="submit" className="rts-btn btn-secondary btn-sm">
                      {category.status === "active" ? "Archive" : "Restore"}
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {(categories ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 4 : 3}>No categories yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Add a category</h5>
          <form action={createCategoryAction}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <div className="input-wrapper">
              <label className="visually-hidden" htmlFor="cat-name">
                Name
              </label>
              <input id="cat-name" name="name" type="text" placeholder="Category name, e.g. Policies" required />
            </div>
            <div className="input-wrapper">
              <label className="visually-hidden" htmlFor="cat-description">
                Description
              </label>
              <input id="cat-description" name="description" type="text" placeholder="Description (optional)" />
            </div>
            <button type="submit" className="rts-btn btn-primary">
              Add category
            </button>
          </form>
        </>
      )}
    </div>
  );
}
