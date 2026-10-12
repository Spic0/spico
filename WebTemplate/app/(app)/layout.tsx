import type { ReactNode } from "react";
import { requireUser } from "@/lib/authz";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { TopBar } from "@/components/layout/TopBar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <ThemeProvider>
      <TopBar userFullName={user.fullName} userEmail={user.email} homeHref="/" />
      {children}
    </ThemeProvider>
  );
}
