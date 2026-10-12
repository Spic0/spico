"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { flash } from "@/lib/flash";

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().max(1000).optional(),
});

export async function createCategoryAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.categories.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const slug = slugify(parsed.name);
  if (!slug) {
    await flash("error", "Name must contain at least one letter or number");
    return;
  }

  const supabase = await createClient();
  const { data: category, error } = await supabase
    .from("kb_categories")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      name: parsed.name,
      slug,
      description: parsed.description ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !category) {
    await flash("error", error?.message ?? "Failed to create category (a category with this name may already exist)");
    return;
  }

  await flash("success", `Category ${parsed.name} created`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.category.created",
    targetType: "kb_category",
    targetId: category.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: parsed.name, slug, description: parsed.description ?? null },
  });
}

const updateSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().max(1000).optional(),
});

export async function updateCategoryAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.categories.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("kb_categories")
    .select("name, description")
    .eq("id", parsed.categoryId)
    .single();

  const { data: updated, error } = await supabase
    .from("kb_categories")
    .update({ name: parsed.name, description: parsed.description ?? null })
    .eq("id", parsed.categoryId)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to update category");
    return;
  }

  await flash("success", `Category ${parsed.name} saved`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.category.updated",
    targetType: "kb_category",
    targetId: parsed.categoryId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before,
    after: { name: parsed.name, description: parsed.description ?? null },
  });
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  categoryId: z.string().min(1),
  nextStatus: z.enum(["active", "archived"]),
});

export async function setCategoryStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    categoryId: formData.get("categoryId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("kb.categories.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("kb_categories")
    .update({ status: parsed.nextStatus })
    .eq("id", parsed.categoryId)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to change category status");
    return;
  }

  await flash("success", parsed.nextStatus === "active" ? "Category restored" : "Category archived");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "kb.category.status_changed",
    targetType: "kb_category",
    targetId: parsed.categoryId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: parsed.nextStatus },
  });
}
