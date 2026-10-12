import type { ReactNode } from "react";
import { requireUser } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { orgNavItems } from "@/lib/nav";

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const user = await requireUser();
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);

  return (
    <DashboardShell
      sections={[{ items: orgNavItems(organization.slug) }]}
      userFullName={user.fullName}
      userEmail={user.email}
    >
      {children}
    </DashboardShell>
  );
}
