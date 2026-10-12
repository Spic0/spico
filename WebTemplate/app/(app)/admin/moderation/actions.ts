"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

// Any platform role (moderator/admin/superadmin) can raise a flag — this is
// Platform Moderator's one genuinely new, actionable capability as of M10 (it
// was read-only everywhere before). Only admin/superadmin can resolve one —
// mirrors real moderation workflows: mods flag, admins act. See docs/rbac.md.

const raiseSchema = z.object({
  targetType: z.enum(["organization", "hotel"]),
  targetId: z.string().min(1, "Target id is required"),
  reason: z.string().min(5, "Reason must be at least 5 characters").max(1000),
});

export async function raiseModerationFlagAction(formData: FormData): Promise<void> {
  const user = await requirePlatformRole(["moderator", "admin", "superadmin"]);

  const result = raiseSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const supabase = await createClient();

  // target_id is validated against the real table here (not a DB FK — see
  // the migration comment) so a flag can never point at a nonexistent row.
  const table = p.targetType === "organization" ? "organizations" : "hotels";
  const { data: target } = await supabase.from(table).select("id").eq("id", p.targetId).single();
  if (!target) {
    await flash("error", `${p.targetType === "organization" ? "Organization" : "Hotel"} not found`);
    return;
  }

  const { data: flag, error } = await supabase
    .from("platform_moderation_flags")
    .insert({ target_type: p.targetType, target_id: p.targetId, reason: p.reason, raised_by: user.id })
    .select("id")
    .single();
  if (error || !flag) {
    await flash("error", error?.message ?? "Failed to raise flag");
    return;
  }

  await flash("success", "Moderation flag raised");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "moderation_flag.raised",
    targetType: p.targetType,
    targetId: p.targetId,
    organizationId: p.targetType === "organization" ? p.targetId : null,
    hotelId: p.targetType === "hotel" ? p.targetId : null,
    after: { reason: p.reason },
  });

  revalidatePath("/admin/moderation");
  revalidatePath("/admin");
}

const resolveSchema = z.object({
  flagId: z.string().min(1),
  resolutionNote: z.string().max(1000).optional(),
});

export async function resolveModerationFlagAction(formData: FormData): Promise<void> {
  const user = await requirePlatformRole(["admin", "superadmin"]);

  const result = resolveSchema.safeParse({
    flagId: formData.get("flagId"),
    resolutionNote: (formData.get("resolutionNote") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_moderation_flags")
    .update({ status: "resolved", resolved_by: user.id, resolved_at: new Date().toISOString(), resolution_note: p.resolutionNote || null })
    .eq("id", p.flagId);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", "Flag resolved");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "moderation_flag.resolved",
    targetType: "moderation_flag",
    targetId: p.flagId,
    after: { resolution_note: p.resolutionNote ?? null },
  });

  revalidatePath("/admin/moderation");
}
