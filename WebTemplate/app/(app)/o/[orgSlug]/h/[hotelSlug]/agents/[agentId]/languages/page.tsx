import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { languageLabel } from "@/lib/languages";
import { updateAgentLanguagesAction } from "./actions";

export default async function AgentLanguagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, agentId);
  const user = await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "ai_agents.manage_languages", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: agentLanguages, error } = await supabase
    .from("ai_agent_languages")
    .select("language_code, enabled, is_default, localized_greeting, localized_fallback, voice_preference")
    .eq("agent_id", agentId);

  if (error) {
    throw new Error(`Failed to load agent languages: ${error.message}`);
  }

  const byCode = new Map((agentLanguages ?? []).map((l) => [l.language_code, l]));

  return (
    <div>
      <p className="spico-muted">
        Select which of {hotel.name}&apos;s supported languages this agent uses, and its default. Localized messages
        and voice preference are optional — no translation or voice synthesis is performed yet.
      </p>
      <form action={updateAgentLanguagesAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="agentId" value={agentId} />

        {hotel.languages.map((code) => {
          const existing = byCode.get(code);
          return (
            <fieldset key={code} className="spico-callout" disabled={!canManage}>
              <input type="hidden" name="language_code" value={code} />
              <div className="spico-inline-form">
                <label className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    name={`enabled_${code}`}
                    defaultChecked={existing?.enabled ?? false}
                  />
                  <span className="form-check-label">
                    <strong>{languageLabel(code)}</strong>
                  </span>
                </label>
                <label className="form-check">
                  <input
                    type="radio"
                    name="defaultLanguage"
                    value={code}
                    defaultChecked={existing?.is_default ?? code === agent.default_language}
                  />
                  <span className="form-check-label">Default</span>
                </label>
              </div>
              <div className="input-wrapper mt--10">
                <label htmlFor={`greeting_${code}`}>Localized greeting (optional)</label>
                <input
                  id={`greeting_${code}`}
                  name={`greeting_${code}`}
                  type="text"
                  defaultValue={existing?.localized_greeting ?? ""}
                />
              </div>
              <div className="input-wrapper">
                <label htmlFor={`fallback_${code}`}>Localized fallback (optional)</label>
                <input
                  id={`fallback_${code}`}
                  name={`fallback_${code}`}
                  type="text"
                  defaultValue={existing?.localized_fallback ?? ""}
                />
              </div>
              <div className="input-wrapper">
                <label htmlFor={`voice_${code}`}>Voice preference (optional, placeholder for later)</label>
                <input
                  id={`voice_${code}`}
                  name={`voice_${code}`}
                  type="text"
                  defaultValue={existing?.voice_preference ?? ""}
                />
              </div>
            </fieldset>
          );
        })}

        {canManage && (
          <button type="submit" className="rts-btn btn-primary mt--10">
            Save languages
          </button>
        )}
      </form>
    </div>
  );
}
