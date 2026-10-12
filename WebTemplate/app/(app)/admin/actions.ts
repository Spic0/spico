"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

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
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid request");
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
    throw new Error(`Failed to update organization status: ${error.message}`);
  }

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
