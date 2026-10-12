import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { languageLabel } from "@/lib/languages";
import type { AgentTestSimulationResult } from "@/lib/agentTestSimulation";
import { runAgentTestAction } from "./actions";

export default async function AgentTestPlaygroundPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; agentId: string }>;
}) {
  const { orgSlug, hotelSlug, agentId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await getAgentByIdOrNotFound(hotel.id, agentId);
  await requirePermission("ai_agents.test", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const [{ data: languages }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase.from("ai_agent_languages").select("language_code").eq("agent_id", agentId).eq("enabled", true),
    supabase
      .from("ai_agent_test_sessions")
      .select("id, sample_message, test_language, simulated_result, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (sessionsError) throw new Error(`Failed to load test sessions: ${sessionsError.message}`);

  return (
    <div>
      <div className="spico-callout">
        <strong>Configuration Simulation — No AI Request or External Action Is Executed.</strong> This page never
        calls an AI provider, sends a message, places a call, or creates a reservation. It only shows what the
        agent&apos;s stored configuration would do.
      </div>

      <form action={runAgentTestAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <input type="hidden" name="agentId" value={agentId} />
        <div className="input-wrapper">
          <label htmlFor="sampleMessage">Sample guest message</label>
          <textarea id="sampleMessage" name="sampleMessage" rows={3} required />
        </div>
        <div className="input-wrapper">
          <label htmlFor="testLanguage">Test language</label>
          <select id="testLanguage" name="testLanguage" required defaultValue="">
            <option value="" disabled>
              Select a language
            </option>
            {(languages ?? []).map((l) => (
              <option key={l.language_code} value={l.language_code}>
                {languageLabel(l.language_code)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rts-btn btn-primary">
          Run simulation
        </button>
      </form>

      <h5 className="title mt--30">Recent simulations</h5>
      {(sessions ?? []).length === 0 && <p className="spico-muted">No simulations run yet.</p>}
      {(sessions ?? []).map((session) => {
        const sim = session.simulated_result as AgentTestSimulationResult;
        return (
          <div className="spico-callout" key={session.id}>
            <strong>
              &quot;{session.sample_message}&quot; ({languageLabel(session.test_language)})
            </strong>
            <span className="spico-muted"> — {new Date(session.created_at).toLocaleString()}</span>
            <ul className="spico-plain-list">
              <li>Operating mode: {sim.operatingMode.replace("_", " ")}</li>
              <li>Language supported: {sim.languageSupported ? "Yes" : "No"}</li>
              <li>Enabled capabilities: {sim.enabledCapabilities.join(", ") || "none"}</li>
              <li>
                Would require approval: {sim.wouldRequireApproval ? "Yes" : "No"}
                {sim.approvalReasons.length > 0 && ` — ${sim.approvalReasons.join(" ")}`}
              </li>
              <li>
                Handoff would apply: {sim.handoffWouldApply ? "Yes" : "No"}
                {sim.handoffReasons.length > 0 && ` — ${sim.handoffReasons.join(" ")}`}
              </li>
              <li>Knowledge base scope: {sim.knowledgeBaseScope}</li>
            </ul>
          </div>
        );
      })}
    </div>
  );
}
