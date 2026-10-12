"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  phoneNumber: z.string().max(30).optional(),
  defaultAgentId: z.string().optional(),
  greetingNote: z.string().max(1000).optional(),
});

export async function saveVoiceSettingsAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    phoneNumber: (formData.get("phoneNumber") as string | null)?.trim() || undefined,
    defaultAgentId: (formData.get("defaultAgentId") as string | null) || undefined,
    greetingNote: (formData.get("greetingNote") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;
  const enabled = formData.get("enabled") === "on";

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("voice.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();

  // A chosen default agent must belong to this hotel (cross-table, app-enforced).
  if (p.defaultAgentId) {
    const { data } = await supabase.from("ai_agents").select("id").eq("id", p.defaultAgentId).eq("hotel_id", hotel.id).single();
    if (!data) throw new Error("Selected agent does not belong to this hotel");
  }

  const { error } = await supabase.from("hotel_voice_settings").upsert(
    {
      organization_id: organization.id,
      hotel_id: hotel.id,
      enabled,
      phone_number: p.phoneNumber || null,
      default_agent_id: p.defaultAgentId || null,
      greeting_note: p.greetingNote || null,
      created_by: user.id,
    },
    { onConflict: "hotel_id" },
  );
  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "voice_settings.saved",
    targetType: "hotel_voice_settings",
    targetId: hotel.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { enabled, phone_number: p.phoneNumber ?? null, default_agent_id: p.defaultAgentId ?? null },
  });
}
