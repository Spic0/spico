import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { runHotelReadinessChecks } from "@/lib/hotelReadiness";
import { StatusChip } from "@/components/ui/StatusChip";
import { ActivateHotelForm } from "./ActivateHotelForm";

// Milestone 12 onboarding hub. Steps 1-2 (create org/hotel) are already done
// by the time this page is reachable; steps 3-9 of the brief's 12-step guide
// map directly onto the 9 readiness checks below and link out to the
// existing pages that already own each piece of configuration — this page
// does not reimplement departments/schedule/rooms/team forms, it links to
// them. Steps 10-12 (booking engine, review, activate) are handled here.
export default async function HotelOnboardingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("hotel.settings.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });
  const canActivate = await hasPermission(user.id, "hotel.activate", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const readiness = await runHotelReadinessChecks(hotel, organization.id);

  const fixLinks: Record<string, string> = {
    profile_complete: `/o/${orgSlug}/h/${hotelSlug}/settings`,
    timezone_configured: `/o/${orgSlug}/h/${hotelSlug}/settings`,
    guest_language_configured: `/o/${orgSlug}/h/${hotelSlug}/settings`,
    active_department_exists: `/o/${orgSlug}/h/${hotelSlug}/departments`,
    business_hours_configured: `/o/${orgSlug}/h/${hotelSlug}/schedule`,
    active_room_type_exists: `/o/${orgSlug}/h/${hotelSlug}/pms`,
    active_room_exists: `/o/${orgSlug}/h/${hotelSlug}/pms`,
    active_rate_plan_exists: `/o/${orgSlug}/h/${hotelSlug}/pms`,
    authorized_owner_exists: `/o/${orgSlug}/team`,
  };

  return (
    <div className="pt--40">
      <h4 className="title" style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {hotel.name} — Onboarding <StatusChip status={hotel.status} />
      </h4>
      <p className="spico-muted">
        A hotel stays in <strong>onboarding</strong> until every check below passes. Voice configuration and payment
        processing are never required to activate — a hotel can go active for PMS and booking-engine testing
        without either. Once active, staff can also invite team members (Team &amp; Roles), configure an AI agent
        (AI Agents), and enable the public booking engine (Booking Engine) — none of those are gated here.
      </p>

      <div className="spico-panel mt--20">
        <h5 className="title">Readiness checklist</h5>
        <ul className="spico-plain-list">
          {readiness.checks.map((check) => (
            <li key={check.key}>
              <span style={{ color: check.passed ? "var(--color-primary)" : "var(--color-danger)", fontWeight: 600 }}>
                {check.passed ? "✓" : "✗"}
              </span>{" "}
              {check.label}
              {!check.passed && fixLinks[check.key] && (
                <>
                  {" — "}
                  <a href={fixLinks[check.key]}>fix this</a>
                </>
              )}
              {check.detail && <div className="spico-muted">{check.detail}</div>}
            </li>
          ))}
        </ul>
      </div>

      {hotel.status === "active" ? (
        <p className="spico-form-success mt--20">This hotel is active.</p>
      ) : canActivate ? (
        <ActivateHotelForm orgSlug={orgSlug} hotelSlug={hotelSlug} allPassed={readiness.allPassed} />
      ) : (
        <p className="spico-muted mt--20">Only a Hotel General Manager or Hotel Owner can activate this hotel.</p>
      )}
    </div>
  );
}
