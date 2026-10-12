import type { ReactNode } from "react";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { TabNav } from "@/components/layout/TabNav";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function PmsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("pms.read", { hotelId: hotel.id, organizationId: organization.id });

  const base = `/o/${organization.slug}/h/${hotel.slug}/pms`;

  return (
    <div className="pt--40">
      <PageHeader title="Rooms & Rates" subtitle={`${hotel.name} · ${organization.name}`} />
      <TabNav
        items={[
          { href: base, label: "Room Types" },
          { href: `${base}/rooms`, label: "Rooms" },
          { href: `${base}/rates`, label: "Rate Plans" },
        ]}
      />
      {children}
    </div>
  );
}
