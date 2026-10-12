"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: string;
}

export interface SidebarSection {
  title?: string;
  items: SidebarNavItem[];
}

interface LeftSidebarProps {
  sections: SidebarSection[];
  userFullName: string | null;
  userEmail: string | null;
}

export function LeftSidebar({ sections, userFullName, userEmail }: LeftSidebarProps) {
  const pathname = usePathname();
  const { sidebarCollapsed } = useTheme();

  // Only the single best-matching item should be active. An item matches when
  // the current path equals its href or is nested under it; among all matches
  // the one with the LONGEST href wins. Without this, index items (e.g. the
  // hotel dashboard root, "/admin", "/o/<slug>") stay highlighted on every
  // child route because they are a prefix of everything. See docs/ui-bug-audit.md (BUG-04).
  const activeHref = sections
    .flatMap((section) => section.items.map((item) => item.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className={`left-side-bar ${sidebarCollapsed ? "collapsed" : ""}`}>
      <div className="overlay-mobile-area" />
      <div className="inner">
        {sections.map((section, index) => (
          <div className="single-menu-wrapper" key={section.title ?? index}>
            {section.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`single-menu ${active ? "active" : ""}`}
                  aria-label={item.label}
                  data-tooltip={item.label}
                >
                  <div className="icon">
                    <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
                  </div>
                  <p>{item.label}</p>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="bottom-user">
        <div className="user-wrapper">
          <i className="fa-solid fa-circle-user spico-sidebar-avatar" aria-hidden="true" />
          <div className="info">
            <h6 className="title">{userFullName ?? "Unnamed user"}</h6>
            <span>{userEmail ?? ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
