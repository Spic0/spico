import type { ReactNode } from "react";
import { requireUser } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { orgNavItems } from "@/lib/nav";

// In the (org) route group so this org-chrome DashboardShell wraps ONLY the
// org-level pages, not the hotel subtree at o/[orgSlug]/h/* (which renders its
// own shell) — otherwise hotel pages got two sidebars and a doubled margin.
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
