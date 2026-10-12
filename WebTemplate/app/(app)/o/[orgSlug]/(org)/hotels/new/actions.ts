"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import { checkHotelCreationAllowed } from "@/lib/planLimits";

const schema = z.object({
  orgSlug: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
});

export async function createHotelAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    name: formData.get("name"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const user = await requirePermission("hotel.settings.manage", { organizationId: organization.id });

  const planLimit = await checkHotelCreationAllowed(organization.id);
  if (!planLimit.allowed) {
    throw new Error(planLimit.reason ?? "This organization's plan does not allow creating another hotel.");
  }

  const supabase = await createClient();
  const baseSlug = slugify(parsed.name) || "hotel";
  let slug = baseSlug;
  let hotelId: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("hotels")
      .insert({ organization_id: organization.id, name: parsed.name, slug })
      .select("id, slug")
      .single();

    if (!error && data) {
      hotelId = data.id;
      slug = data.slug;
      break;
    }

    if (error?.code === "23505") {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }

    throw new Error(error?.message ?? "Failed to create hotel");
  }

  if (!hotelId) {
    throw new Error("Failed to create hotel after multiple attempts");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "hotel.created",
    targetType: "hotel",
    targetId: hotelId,
    organizationId: organization.id,
    hotelId,
    after: { name: parsed.name, slug },
  });

  redirect(`/o/${organization.slug}/h/${slug}`);
}
