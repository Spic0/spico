import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requireUser, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { HOTEL_MODULES } from "@/lib/nav";
import { languageLabel } from "@/lib/languages";
import { runHotelReadinessChecks } from "@/lib/hotelReadiness";
import { StatusChip } from "@/components/ui/StatusChip";

const PROFILE_FIELDS = [
  "description",
  "hotel_type",
  "star_rating",
  "logo_url",
  "address_line1",
  "city",
  "country_code",
  "postal_code",
  "contact_email",
  "contact_phone",
  "website_url",
  "default_guest_language",
] as const;

export default async function HotelDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const user = await requireUser();
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);

  const readiness = hotel.status !== "active" ? await runHotelReadinessChecks(hotel, organization.id) : null;

  const supabase = await createClient();
  const [{ count: teamCount }, { count: departmentCount }, canViewAudit, canViewAgents, canViewKb] = await Promise.all([
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("status", "active"),
    supabase
      .from("departments")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("status", "active"),
    hasPermission(user.id, "audit_log.view", { hotelId: hotel.id }),
    hasPermission(user.id, "ai_agents.read", { hotelId: hotel.id }),
    hasPermission(user.id, "kb.read", { hotelId: hotel.id }),
  ]);

  const canViewInbox = await hasPermission(user.id, "inbox.view", { hotelId: hotel.id });
  const openConversations = canViewInbox
    ? (
        await supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("hotel_id", hotel.id)
          .eq("status", "open")
      ).count ?? 0
    : null;

  const canViewIntegrations = await hasPermission(user.id, "integrations.read", { hotelId: hotel.id });
  const integrationStats = canViewIntegrations
    ? await (async () => {
        const [{ count: activeApiKeys }, { count: activeWebhooks }] = await Promise.all([
          supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id).eq("status", "active"),
          supabase.from("webhooks").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id).eq("status", "active"),
        ]);
        return { activeApiKeys: activeApiKeys ?? 0, activeWebhooks: activeWebhooks ?? 0 };
      })()
    : null;

  const canViewCalls = await hasPermission(user.id, "calls.read", { hotelId: hotel.id });
  const voiceStats = canViewCalls
    ? await (async () => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const [{ count: callsToday }, { count: pendingHandoffs }] = await Promise.all([
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", hotel.id)
            .gte("started_at", todayStart.toISOString()),
          supabase
            .from("calls")
            .select("id", { count: "exact", head: true })
            .eq("hotel_id", hotel.id)
            .eq("disposition", "handoff_required"),
        ]);
        return { callsToday: callsToday ?? 0, pendingHandoffs: pendingHandoffs ?? 0 };
      })()
    : null;

  const canViewReservations = await hasPermission(user.id, "reservations.read", { hotelId: hotel.id });
  const frontDesk = canViewReservations
    ? await (async () => {
        const today = new Date().toISOString().slice(0, 10);
        const [{ count: arrivals }, { count: departures }, { count: inHouse }, { count: totalRooms }] =
          await Promise.all([
            supabase
              .from("reservations")
              .select("id", { count: "exact", head: true })
              .eq("hotel_id", hotel.id)
              .eq("check_in_date", today)
              .in("status", ["pending", "confirmed"]),
            supabase
              .from("reservations")
              .select("id", { count: "exact", head: true })
              .eq("hotel_id", hotel.id)
              .eq("check_out_date", today)
              .eq("status", "checked_in"),
            supabase
              .from("reservations")
              .select("id", { count: "exact", head: true })
              .eq("hotel_id", hotel.id)
              .eq("status", "checked_in"),
            supabase
              .from("rooms")
              .select("id", { count: "exact", head: true })
              .eq("hotel_id", hotel.id)
              .eq("status", "active"),
          ]);
        const occupancy = totalRooms && totalRooms > 0 ? Math.round(((inHouse ?? 0) / totalRooms) * 100) : 0;
        return { arrivals: arrivals ?? 0, departures: departures ?? 0, inHouse: inHouse ?? 0, occupancy };
      })()
    : null;

  const canViewHousekeeping = await hasPermission(user.id, "housekeeping.read", { hotelId: hotel.id });
  const housekeepingStats = canViewHousekeeping
    ? await (async () => {
        const [{ count: pending }, { count: inProgress }] = await Promise.all([
          supabase.from("housekeeping_tasks").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id).eq("status", "pending"),
          supabase.from("housekeeping_tasks").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id).eq("status", "in_progress"),
        ]);
        return { pending: pending ?? 0, inProgress: inProgress ?? 0 };
      })()
    : null;

  const kbStats = canViewKb
    ? await (async () => {
        const [{ count: articles }, { count: documents }] = await Promise.all([
          supabase.from("kb_articles").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id),
          supabase.from("kb_documents").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id),
        ]);
        return { articles: articles ?? 0, documents: documents ?? 0 };
      })()
    : null;

  const recentActivity = canViewAudit
    ? await supabase
        .from("audit_log")
        .select("id, action, actor_type, actor_profile_id, created_at")
        .eq("hotel_id", hotel.id)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  const recentAgentActivity = canViewAudit
    ? await supabase
        .from("audit_log")
        .select("id, action, actor_type, actor_profile_id, created_at")
        .eq("hotel_id", hotel.id)
        .like("action", "ai_agent.%")
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  let agentStats = {
    active: 0,
    draft: 0,
    requiringConfig: 0,
    missingSchedule: 0,
    missingLanguage: 0,
    missingHandoff: 0,
  };

  if (canViewAgents) {
    const { data: agents } = await supabase
      .from("ai_agents")
      .select("id, status, use_hotel_business_hours")
      .eq("hotel_id", hotel.id);
    const agentIds = (agents ?? []).map((a) => a.id);

    const [{ data: enabledLangs }, { data: scheduleRows }, { data: handoffRows }] = agentIds.length
      ? await Promise.all([
          supabase.from("ai_agent_languages").select("agent_id").eq("enabled", true).in("agent_id", agentIds),
          supabase.from("ai_agent_schedules").select("agent_id").in("agent_id", agentIds),
          supabase.from("ai_agent_handoff_rules").select("agent_id, handoff_enabled").in("agent_id", agentIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const agentsWithLanguage = new Set((enabledLangs ?? []).map((l) => l.agent_id));
    const agentsWithScheduleRows = new Set((scheduleRows ?? []).map((s) => s.agent_id));
    const handoffEnabledByAgent = new Map((handoffRows ?? []).map((h) => [h.agent_id, h.handoff_enabled]));

    const missingLanguage = (a: { id: string }) => !agentsWithLanguage.has(a.id);
    const missingSchedule = (a: { id: string; use_hotel_business_hours: boolean }) =>
      !a.use_hotel_business_hours && !agentsWithScheduleRows.has(a.id);
    const missingHandoff = (a: { id: string }) => !handoffEnabledByAgent.get(a.id);

    agentStats = {
      active: (agents ?? []).filter((a) => a.status === "active").length,
      draft: (agents ?? []).filter((a) => a.status === "draft").length,
      missingLanguage: (agents ?? []).filter(missingLanguage).length,
      missingSchedule: (agents ?? []).filter(missingSchedule).length,
      missingHandoff: (agents ?? []).filter(missingHandoff).length,
      requiringConfig: (agents ?? []).filter(
        (a) => a.status === "draft" || missingLanguage(a) || missingSchedule(a) || missingHandoff(a),
      ).length,
    };
  }

  const actorIds = Array.from(
    new Set((recentActivity.data ?? []).map((e) => e.actor_profile_id).filter((id): id is string => id !== null)),
  );
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, email").in("id", actorIds)
    : { data: [] };
  const actorEmailById = new Map((actors ?? []).map((a) => [a.id, a.email]));

  const filledFieldCount = PROFILE_FIELDS.filter(
    (field) => hotel[field] !== null && hotel[field] !== undefined && hotel[field] !== "",
  ).length;
  const profileCompletionPct = Math.round((filledFieldCount / PROFILE_FIELDS.length) * 100);

  return (
    <div className="pt--40">
      <h4 className="title">
        {hotel.name} <span className="spico-muted">· {organization.name}</span>
      </h4>

      {readiness && (
        <div className="spico-callout">
          <strong>This hotel is still onboarding.</strong>{" "}
          {readiness.checks.filter((c) => c.passed).length}/{readiness.checks.length} readiness checks passed.{" "}
          <a href={`/o/${orgSlug}/h/${hotelSlug}/onboarding`}>Review the onboarding checklist</a>.
        </div>
      )}

      <div className="spico-kpi-row">
        <div className="spico-kpi-card">
          <span className="spico-kpi-value">{teamCount ?? 0}</span>
          <span className="spico-kpi-label">Active team members</span>
        </div>
        <div className="spico-kpi-card">
          <span className="spico-kpi-value">{departmentCount ?? 0}</span>
          <span className="spico-kpi-label">Active departments</span>
        </div>
        <div className="spico-kpi-card">
          <span className="spico-kpi-value">
            <StatusChip status={hotel.status} />
          </span>
          <span className="spico-kpi-label">Onboarding status</span>
        </div>
        <div className="spico-kpi-card">
          <span className="spico-kpi-value">{profileCompletionPct}%</span>
          <span className="spico-kpi-label">Profile completeness</span>
          <div className="spico-completion-bar">
            <span style={{ width: `${profileCompletionPct}%` }} />
          </div>
        </div>
      </div>

      <p className="spico-muted">
        Timezone {hotel.timezone} · Check-in {hotel.check_in_time.slice(0, 5)} · Check-out{" "}
        {hotel.check_out_time.slice(0, 5)} · Languages: {hotel.languages.map(languageLabel).join(", ")}
      </p>

      {canViewAgents && (
        <>
          <h5 className="title mt--30">AI Agents</h5>
          <div className="spico-kpi-row">
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{agentStats.active}</span>
              <span className="spico-kpi-label">Active agents</span>
            </div>
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{agentStats.draft}</span>
              <span className="spico-kpi-label">Draft agents</span>
            </div>
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{agentStats.requiringConfig}</span>
              <span className="spico-kpi-label">Agents requiring configuration</span>
            </div>
          </div>
          {(agentStats.missingLanguage > 0 || agentStats.missingSchedule > 0 || agentStats.missingHandoff > 0) && (
            <ul className="spico-plain-list">
              {agentStats.missingLanguage > 0 && <li>{agentStats.missingLanguage} agent(s) with no enabled language.</li>}
              {agentStats.missingSchedule > 0 && (
                <li>{agentStats.missingSchedule} agent(s) using a custom schedule with no hours configured yet.</li>
              )}
              {agentStats.missingHandoff > 0 && <li>{agentStats.missingHandoff} agent(s) with handoff disabled.</li>}
            </ul>
          )}
          {(recentAgentActivity.data ?? []).length > 0 && (
            <ul className="spico-plain-list">
              {(recentAgentActivity.data ?? []).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.action}</strong>{" "}
                  <span className="spico-muted">{new Date(entry.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {frontDesk && (
        <>
          <h5 className="title mt--30">Front desk (today)</h5>
          <div className="spico-kpi-row">
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{frontDesk.arrivals}</span>
              <span className="spico-kpi-label">Arrivals</span>
            </div>
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{frontDesk.departures}</span>
              <span className="spico-kpi-label">Departures</span>
            </div>
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{frontDesk.inHouse}</span>
              <span className="spico-kpi-label">In-house</span>
            </div>
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{frontDesk.occupancy}%</span>
              <span className="spico-kpi-label">Occupancy</span>
            </div>
            {housekeepingStats && (
              <div className="spico-kpi-card">
                <span className="spico-kpi-value">{housekeepingStats.pending + housekeepingStats.inProgress}</span>
                <span className="spico-kpi-label">Housekeeping tasks open</span>
              </div>
            )}
          </div>
        </>
      )}

      {voiceStats && (
        <>
          <h5 className="title mt--30">Voice</h5>
          <div className="spico-kpi-row">
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{voiceStats.callsToday}</span>
              <span className="spico-kpi-label">Calls today</span>
            </div>
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{voiceStats.pendingHandoffs}</span>
              <span className="spico-kpi-label">Awaiting handoff</span>
            </div>
          </div>
        </>
      )}

      {openConversations !== null && (
        <>
          <h5 className="title mt--30">Inbox</h5>
          <div className="spico-kpi-row">
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{openConversations}</span>
              <span className="spico-kpi-label">Open conversations</span>
            </div>
          </div>
        </>
      )}

      {kbStats && (
        <>
          <h5 className="title mt--30">Knowledge base</h5>
          <div className="spico-kpi-row">
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{kbStats.articles}</span>
              <span className="spico-kpi-label">Articles</span>
            </div>
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{kbStats.documents}</span>
              <span className="spico-kpi-label">Documents</span>
            </div>
          </div>
        </>
      )}

      {integrationStats && (
        <>
          <h5 className="title mt--30">Integrations</h5>
          <div className="spico-kpi-row">
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{integrationStats.activeApiKeys}</span>
              <span className="spico-kpi-label">Active API keys</span>
            </div>
            <div className="spico-kpi-card">
              <span className="spico-kpi-value">{integrationStats.activeWebhooks}</span>
              <span className="spico-kpi-label">Active webhooks</span>
            </div>
          </div>
        </>
      )}

      {canViewAudit && (
        <>
          <h5 className="title mt--30">Recent activity</h5>
          {(recentActivity.data ?? []).length === 0 ? (
            <p className="spico-muted">No audit log activity yet.</p>
          ) : (
            <ul className="spico-plain-list">
              {(recentActivity.data ?? []).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.action}</strong> by{" "}
                  {entry.actor_type === "user"
                    ? (entry.actor_profile_id && actorEmailById.get(entry.actor_profile_id)) ?? "unknown"
                    : entry.actor_type}{" "}
                  <span className="spico-muted">{new Date(entry.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <h5 className="title mt--30">Modules</h5>
      <div className="spico-kpi-row">
        {HOTEL_MODULES.map((module) => (
          <div className="spico-kpi-card" key={module.key}>
            <i className={`fa-solid ${module.icon}`} aria-hidden="true" style={{ color: "var(--color-primary)" }} />
            <span className="spico-kpi-label" style={{ display: "block", marginTop: 8, fontWeight: 600 }}>
              {module.label}
            </span>
            <span className="spico-muted">Not connected yet — planned for {module.milestone}.</span>
          </div>
        ))}
      </div>
    </div>
  );
}
