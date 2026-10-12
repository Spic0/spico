import type { ReactNode } from "react";
import { LeftSidebar, type SidebarSection } from "./LeftSidebar";

interface DashboardShellProps {
  sections: SidebarSection[];
  userFullName: string | null;
  userEmail: string | null;
  children: ReactNode;
}

// Server Component: composes the (client) LeftSidebar with a content area.
// Used by each context-specific nested layout (platform admin / org / hotel)
// so every one gets the shell markup without repeating it.
export function DashboardShell({ sections, userFullName, userEmail, children }: DashboardShellProps) {
  return (
    <div className="dash-board-main-wrapper">
      <LeftSidebar sections={sections} userFullName={userFullName} userEmail={userEmail} />
      <div className="main-center-content-m-left">{children}</div>
    </div>
  );
}
