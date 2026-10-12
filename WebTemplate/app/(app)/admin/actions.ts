"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const toggleSchema = z.object({
  organizationId: z.string().min(1, "organizationId is required"),
  nextStatus: z.enum(["active", "suspended"]),
});

export async function setOrganizationStatusAction(formData: FormData): Promise<void> {
  // Suspending/reactivating a tenant is platform.admin-gated: Platform
  // Moderator is read-only and must not reach this action.
  const user = await requirePlatformRole(["admin", "superadmin"]);

  const parsed = toggleSchema.safeParse({
    organizationId: formData.get("organizationId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!parsed.success) {
    await flash("error", parsed.error.issues[0]?.message ?? "Invalid request");
    return;
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("organizations")
    .select("status")
    .eq("id", parsed.data.organizationId)
    .single();

  const { error } = await supabase
    .from("organizations")
    .update({ status: parsed.data.nextStatus })
    .eq("id", parsed.data.organizationId);

  if (error) {
    await flash("error", `Failed to update organization status: ${error.message}`);
    return;
  }

  await flash("success", parsed.data.nextStatus === "active" ? "Organization reactivated" : "Organization suspended");

  await writeAuditLog({
    actorProfileId: user.id,
    actorType: "user",
    action: "organization.status_changed",
    targetType: "organization",
    targetId: parsed.data.organizationId,
    organizationId: parsed.data.organizationId,
    before,
    after: { status: parsed.data.nextStatus },
  });

  revalidatePath("/admin");
}
