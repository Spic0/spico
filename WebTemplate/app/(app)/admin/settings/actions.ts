"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const PLATFORM_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

const schema = z.object({
  platformName: z.string().min(1, "Platform name is required").max(120),
  supportEmail: z.string().max(200).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Invalid email").optional().or(z.literal("")),
  announcementMessage: z.string().max(1000).optional(),
});

export async function savePlatformSettingsAction(formData: FormData): Promise<void> {
  const user = await requirePlatformRole(["admin", "superadmin"]);

  const result = schema.safeParse({
    platformName: formData.get("platformName"),
    supportEmail: (formData.get("supportEmail") as string | null)?.trim() || undefined,
    announcementMessage: (formData.get("announcementMessage") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;
  const maintenanceMode = formData.get("maintenanceMode") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("platform_settings")
    .update({
      platform_name: p.platformName,
      support_email: p.supportEmail || null,
      announcement_message: p.announcementMessage || null,
      maintenance_mode: maintenanceMode,
      updated_by: user.id,
    })
    .eq("id", PLATFORM_SETTINGS_ID);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", "Platform settings saved");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "platform_settings.updated",
    targetType: "platform_settings",
    targetId: PLATFORM_SETTINGS_ID,
    after: { platform_name: p.platformName, maintenance_mode: maintenanceMode },
  });
}
