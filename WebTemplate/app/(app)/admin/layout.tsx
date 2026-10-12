import type { ReactNode } from "react";
import { requirePlatformRole } from "@/lib/authz";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { PLATFORM_NAV_ITEMS } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requirePlatformRole(["moderator", "admin", "superadmin"]);

  return (
    <DashboardShell
      sections={[{ items: PLATFORM_NAV_ITEMS }]}
      userFullName={user.fullName}
      userEmail={user.email}
    >
      {children}
    </DashboardShell>
  );
}
