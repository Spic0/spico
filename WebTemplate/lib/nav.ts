// Shared nav/module config. Consumed by components/layout/LeftSidebar and by
// the generic hotel-module placeholder route. Modules beyond "dashboard" have
// no real feature yet — see docs/roadmap.md for when each one ships.

export interface HotelModule {
  key: string;
  label: string;
  icon: string;
  description: string;
  milestone: string;
}

export const HOTEL_MODULES: HotelModule[] = [
  {
    key: "automations",
    label: "Automations",
    icon: "fa-diagram-project",
    description: "Automated workflows triggered by guest or reservation events.",
    milestone: "M6",
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: "fa-chart-line",
    description: "Performance and usage analytics.",
    milestone: "M6",
  },
];

export function findHotelModule(key: string): HotelModule | undefined {
  return HOTEL_MODULES.find((mod) => mod.key === key);
}

export interface StaticNavItem {
  href: string;
  label: string;
  icon: string;
}

export const PLATFORM_NAV_ITEMS: StaticNavItem[] = [
  { href: "/admin", label: "Organizations", icon: "fa-building" },
  { href: "/admin/moderation", label: "Moderation", icon: "fa-flag" },
  { href: "/admin/plans", label: "Plans", icon: "fa-tags" },
  { href: "/admin/settings", label: "Platform Settings", icon: "fa-sliders" },
  { href: "/admin/system-health", label: "System Health", icon: "fa-heart-pulse" },
  { href: "/admin/audit-log", label: "Audit Log", icon: "fa-clipboard-list" },
];

export function orgNavItems(orgSlug: string): StaticNavItem[] {
  return [
    { href: `/o/${orgSlug}`, label: "Hotels", icon: "fa-hotel" },
    { href: `/o/${orgSlug}/team`, label: "Team & Roles", icon: "fa-users-gear" },
    { href: `/o/${orgSlug}/billing`, label: "Billing", icon: "fa-credit-card" },
    { href: `/o/${orgSlug}/audit-log`, label: "Audit Log", icon: "fa-clipboard-list" },
    { href: `/o/${orgSlug}/settings`, label: "Settings", icon: "fa-gear" },
  ];
}

export function hotelNavItems(orgSlug: string, hotelSlug: string): StaticNavItem[] {
  const base = `/o/${orgSlug}/h/${hotelSlug}`;
  return [
    { href: base, label: "Dashboard", icon: "fa-gauge" },
    { href: `${base}/onboarding`, label: "Onboarding", icon: "fa-clipboard-check" },
    { href: `${base}/inbox`, label: "Inbox", icon: "fa-inbox" },
    { href: `${base}/calls`, label: "Calls", icon: "fa-phone" },
    { href: `${base}/reservations`, label: "Reservations", icon: "fa-calendar-check" },
    { href: `${base}/guests`, label: "Guests", icon: "fa-user-group" },
    { href: `${base}/pms`, label: "Rooms & Rates", icon: "fa-bed" },
    { href: `${base}/housekeeping`, label: "Housekeeping", icon: "fa-broom" },
    { href: `${base}/booking`, label: "Booking Engine", icon: "fa-globe" },
    { href: `${base}/departments`, label: "Departments", icon: "fa-sitemap" },
    { href: `${base}/schedule`, label: "Business Hours", icon: "fa-clock" },
    { href: `${base}/agents`, label: "AI Agents", icon: "fa-robot" },
    { href: `${base}/knowledge-base`, label: "Knowledge Base", icon: "fa-book" },
    { href: `${base}/integrations`, label: "Integrations", icon: "fa-plug" },
    ...HOTEL_MODULES.map((mod) => ({ href: `${base}/${mod.key}`, label: mod.label, icon: mod.icon })),
    { href: `${base}/test-data`, label: "Test Data", icon: "fa-flask" },
    { href: `${base}/settings`, label: "Settings", icon: "fa-gear" },
  ];
}
