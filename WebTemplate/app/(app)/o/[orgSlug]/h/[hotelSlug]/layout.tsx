import type { ReactNode } from "react";
import { requireUser } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { hotelNavItems } from "@/lib/nav";

export default async function HotelLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const user = await requireUser();
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  await getHotelBySlugOrNotFound(organization.id, hotelSlug);

  return (
    <DashboardShell
      sections={[{ items: hotelNavItems(organization.slug, hotelSlug) }]}
      userFullName={user.fullName}
      userEmail={user.email}
    >
      {children}
    </DashboardShell>
  );
}
