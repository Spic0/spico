import type { ReactNode } from "react";

// The one <h1> on a dashboard page: a primary→violet gradient banner with the
// page name, an optional "Hotel · Organization" subtitle, and optional actions
// (the list's primary "Add …" button) on the right. Server component.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="spico-page-header">
      <div className="spico-page-header-text">
        <h1 className="spico-page-header-title">{title}</h1>
        {subtitle && <p className="spico-page-header-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="spico-page-header-actions">{actions}</div>}
    </div>
  );
}
