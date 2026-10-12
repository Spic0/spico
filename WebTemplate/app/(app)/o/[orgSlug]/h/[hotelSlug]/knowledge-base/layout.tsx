import type { ReactNode } from "react";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { TabNav } from "@/components/layout/TabNav";

export default async function KnowledgeBaseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("kb.read", { hotelId: hotel.id, organizationId: organization.id });

  const base = `/o/${organization.slug}/h/${hotel.slug}/knowledge-base`;

  return (
    <div className="pt--40">
      <h4 className="title">{hotel.name} — Knowledge Base</h4>
      <TabNav
        items={[
          { href: base, label: "Overview" },
          { href: `${base}/categories`, label: "Categories" },
          { href: `${base}/articles`, label: "Articles" },
          { href: `${base}/documents`, label: "Documents" },
        ]}
      />
      {children}
    </div>
  );
}
