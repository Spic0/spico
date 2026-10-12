"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

function textOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const schema = z
  .object({
    orgSlug: z.string().min(1),
    hotelSlug: z.string().min(1),
    agentId: z.string().min(1),
    defaultLanguage: z.string().min(1, "Choose a default language"),
    languages: z.array(
      z.object({
        code: z.string().min(1),
        enabled: z.boolean(),
        localizedGreeting: z.string().max(1000).optional(),
        localizedFallback: z.string().max(1000).optional(),
        voicePreference: z.string().max(200).optional(),
      }),
    ),
  })
  .refine((d) => d.languages.some((l) => l.enabled), {
    message: "At least one language must be enabled",
    path: ["languages"],
  })
  .refine((d) => d.languages.find((l) => l.code === d.defaultLanguage)?.enabled, {
    message: "Default language must be one of the enabled languages",
    path: ["defaultLanguage"],
  });

export async function updateAgentLanguagesAction(formData: FormData): Promise<void> {
  const codes = formData.getAll("language_code").map(String);
  const languages = codes.map((code) => ({
    code,
    enabled: formData.get(`enabled_${code}`) === "on",
    localizedGreeting: textOrUndefined(formData.get(`greeting_${code}`)),
    localizedFallback: textOrUndefined(formData.get(`fallback_${code}`)),
    voicePreference: textOrUndefined(formData.get(`voice_${code}`)),
  }));

  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    defaultLanguage: formData.get("defaultLanguage"),
    languages,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.manage_languages", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  if (!hotel.languages.some((code) => parsed.languages.some((l) => l.code === code && l.enabled))) {
    await flash("error", "Enabled languages must be among the hotel's supported languages");
    return;
  }

  const supabase = await createClient();
  const { error: upsertError } = await supabase.from("ai_agent_languages").upsert(
    parsed.languages.map((lang) => ({
      agent_id: parsed.agentId,
      language_code: lang.code,
      enabled: lang.enabled,
      is_default: lang.code === parsed.defaultLanguage,
      localized_greeting: lang.localizedGreeting ?? null,
      localized_fallback: lang.localizedFallback ?? null,
      voice_preference: lang.voicePreference ?? null,
    })),
    { onConflict: "agent_id,language_code" },
  );
  if (upsertError) {
    await flash("error", `Failed to save languages: ${upsertError.message}`);
    return;
  }

  const { error: agentError } = await supabase
    .from("ai_agents")
    .update({ default_language: parsed.defaultLanguage, updated_by: user.id })
    .eq("id", parsed.agentId);
  if (agentError) {
    await flash("error", `Languages saved but failed to update the agent's default language: ${agentError.message}`);
    return;
  }

  await flash("success", "Languages saved");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.languages_updated",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { defaultLanguage: parsed.defaultLanguage, enabledCount: parsed.languages.filter((l) => l.enabled).length },
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}/languages`);
}
