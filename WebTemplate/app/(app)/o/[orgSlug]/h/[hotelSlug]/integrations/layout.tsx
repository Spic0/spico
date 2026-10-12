import type { ReactNode } from "react";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { TabNav } from "@/components/layout/TabNav";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function IntegrationsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("integrations.read", { hotelId: hotel.id, organizationId: organization.id });

  const base = `/o/${organization.slug}/h/${hotel.slug}/integrations`;

  return (
    <div className="pt--40">
      <PageHeader title="Integrations" subtitle={`${hotel.name} · ${organization.name}`} />
      <p className="spico-muted">
        Open API keys are real and usable today (see app/api/v1 in the repo). Webhook delivery is real but
        synchronous with a bounded inline retry, not queue-backed. PMS/CRM/calendar/channel-manager connectors are a
        stub foundation — no live vendor connection exists. See docs/roadmap.md (M9).
      </p>
      <TabNav
        items={[
          { href: base, label: "API Keys" },
          { href: `${base}/webhooks`, label: "Webhooks" },
          { href: `${base}/connectors`, label: "Connectors" },
        ]}
      />
      {children}
    </div>
  );
}
