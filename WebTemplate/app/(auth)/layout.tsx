import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="dash-board-main-wrapper pt--40">{children}</div>;
}
