import type { ReactNode } from "react";

// Minimal public shell for the guest-facing booking engine — no dashboard
// sidebar/topbar, no auth. Reachable by anyone (see middleware PUBLIC_PREFIXES).
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="spico-public">{children}</div>;
}
