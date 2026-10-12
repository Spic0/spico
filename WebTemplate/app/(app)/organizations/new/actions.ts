"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { slugify } from "@/lib/slug";
import type { WizardState } from "@/components/ui/Wizard";

const createOrgSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
});

export async function createOrganizationAction(
  _prevState: WizardState,
  formData: FormData,
): Promise<WizardState> {
  const user = await requireUser();
  const parsed = createOrgSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    return { fieldErrors: { name: fe.name?.[0] ?? "Invalid input" } };
  }

  const supabase = await createClient();
  const baseSlug = slugify(parsed.data.name) || "organization";
  const organizationId = randomUUID();
  let slug = baseSlug;
  let created = false;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Insert WITHOUT .select(): the creator is not yet a member of this org, so
    // the organizations SELECT (RLS) policy would forbid reading the row back —
    // and an INSERT ... RETURNING (which .select() triggers) then fails with a
    // row-level-security error. We generate the id and already know the slug, so
    // no read-back is needed. The membership inserted just below is what makes
    // the org visible to its creator.
    const { error } = await supabase
      .from("organizations")
      .insert({ id: organizationId, name: parsed.data.name, slug });

    if (!error) {
      created = true;
      break;
    }

    if (error.code === "23505") {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      continue;
    }

    return { error: error.message ?? "Failed to create organization" };
  }

  if (!created) {
    return { error: "Failed to create organization after multiple attempts" };
  }

  const { error: membershipError } = await supabase.from("memberships").insert({
    profile_id: user.id,
    organization_id: organizationId,
    hotel_id: null,
    role_key: "hotel_owner",
    status: "active",
  });

  if (membershipError) {
    return { error: `Organization created but membership failed: ${membershipError.message}` };
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "organization.created",
    targetType: "organization",
    targetId: organizationId,
    organizationId,
    after: { name: parsed.data.name, slug },
  });

  redirect(`/o/${slug}`);
}
