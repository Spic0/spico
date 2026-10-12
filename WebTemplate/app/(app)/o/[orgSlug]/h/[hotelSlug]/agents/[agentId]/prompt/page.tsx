import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { PLATFORM_PROTECTED_RULES } from "@/lib/agentPromptPolicy";
import { updateAgentPromptAction, restoreAgentPromptVersionAction } from "./actions";

export default async function AgentPromptPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await getAgentByIdOrNotFound(hotel.id, agentId);
  const user = await requirePermission("ai_agents.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManagePrompts = await hasPermission(user.id, "ai_agents.manage_prompts", { hotelId: hotel.id });
  const canRestore = await hasPermission(user.id, "ai_agents.restore_prompt_version", { hotelId: hotel.id });

  const supabase = await createClient();
  const [{ data: active, error: activeError }, { data: versions, error: versionsError }] = await Promise.all([
    supabase.from("ai_agent_prompt_versions").select("*").eq("agent_id", agentId).eq("is_active", true).single(),
    supabase
      .from("ai_agent_prompt_versions")
      .select("version_number, created_at, is_active")
      .eq("agent_id", agentId)
      .order("version_number", { ascending: false }),
  ]);

  if (activeError || !active) throw new Error(`Failed to load prompt: ${activeError?.message ?? "not found"}`);
  if (versionsError) throw new Error(`Failed to load prompt versions: ${versionsError.message}`);

  return (
    <div>
      <div className="spico-callout">
        <strong>Platform-protected rules (never editable, never sent to any AI provider yet):</strong>
        <ul className="spico-plain-list">
          {PLATFORM_PROTECTED_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      <h5 className="title mt--20">Hotel-editable instructions (version {active.version_number})</h5>
      <form action={updateAgentPromptAction} className="spico-settings-form">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="agentId" value={agentId} />

        {(
          [
            ["purpose", "Agent purpose", active.purpose],
            ["hotelIdentity", "Hotel-specific identity", active.hotel_identity],
            ["toneOfVoice", "Tone of voice", active.tone_of_voice],
            ["greetingStyle", "Greeting style", active.greeting_style],
            ["communicationRules", "Communication rules", active.communication_rules],
            ["languageBehavior", "Language behavior", active.language_behavior],
            ["escalationRules", "Escalation rules", active.escalation_rules],
            ["safetyRules", "Additional safety notes (does not override platform rules above)", active.safety_rules],
            ["policyReferences", "Hotel policy references", active.policy_references],
            ["additionalInstructions", "Additional hotel instructions", active.additional_instructions],
          ] as const
        ).map(([name, label, value]) => (
          <div className="input-wrapper" key={name}>
            <label htmlFor={name}>{label}</label>
            <textarea id={name} name={name} rows={3} defaultValue={value ?? ""} disabled={!canManagePrompts} />
          </div>
        ))}

        {canManagePrompts && (
          <button type="submit" className="rts-btn btn-primary mt--10">
            Save as new version
          </button>
        )}
      </form>

      <h5 className="title mt--30">Version history</h5>
      <table className="spico-table">
        <thead>
          <tr>
            <th>Version</th>
            <th>Created</th>
            <th>Status</th>
            {canRestore && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(versions ?? []).map((version) => (
            <tr key={version.version_number}>
              <td>{version.version_number}</td>
              <td>{new Date(version.created_at).toLocaleString()}</td>
              <td>{version.is_active ? "Active" : ""}</td>
              {canRestore && (
                <td>
                  {!version.is_active && (
                    <form action={restoreAgentPromptVersionAction}>
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="hotelSlug" value={hotelSlug} />
                      <input type="hidden" name="agentId" value={agentId} />
                      <input type="hidden" name="versionNumber" value={version.version_number} />
                      <button type="submit" className="rts-btn btn-primary">
                        Restore
                      </button>
                    </form>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
