"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface TabNavItem {
  href: string;
  label: string;
}

// Generic in-page tab navigation (horizontal), distinct from the main
// LeftSidebar. Reusable anywhere a detail page needs its own sub-tabs.
export function TabNav({ items }: { items: TabNavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="spico-tab-nav">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} className={`spico-tab-nav-item ${active ? "active" : ""}`}>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
