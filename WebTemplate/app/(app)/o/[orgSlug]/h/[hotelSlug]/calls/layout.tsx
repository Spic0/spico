import type { ReactNode } from "react";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { TabNav } from "@/components/layout/TabNav";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function CallsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("calls.read", { hotelId: hotel.id, organizationId: organization.id });

  const base = `/o/${organization.slug}/h/${hotel.slug}/calls`;

  return (
    <div className="pt--40">
      <PageHeader title="Calls" subtitle={`${hotel.name} · ${organization.name}`} />
      <p className="spico-muted">
        Voice foundation: every call below comes from the voice-service&apos;s simulate-call test path — no live
        Telnyx/OpenAI Realtime connection exists yet. See docs/roadmap.md (M8).
      </p>
      <TabNav
        items={[
          { href: base, label: "Call History" },
          { href: `${base}/settings`, label: "Voice Settings" },
        ]}
      />
      {children}
    </div>
  );
}
