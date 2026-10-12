// Milestone 12: authorization + environment gate for the internal test-data
// seeding tool. Deliberately NOT requirePermission() — has_permission()'s
// built-in platform bypass admits BOTH platform_role 'admin' and
// 'superadmin' (see supabase/migrations/20260723090009_policies.sql), but
// this feature must be Hotel Owner + Platform Superadmin ONLY, excluding
// Platform Admin. This is the first feature in the project that needs to
// deliberately narrow that universal bypass, so it uses a dedicated check
// instead of the standard permission path. See docs/rbac.md Milestone 12
// section — do not copy this pattern for a normal permission without
// re-reading that reasoning first.
//
// The database functions this gate protects (seed_hotel_test_data /
// remove_hotel_test_data, in supabase/migrations/20260803100003) ALSO
// re-check the caller's identity inside the function body — this app-level
// check alone would not be sufficient, since EXECUTE is granted to
// `authenticated` generally and any logged-in user could otherwise invoke
// the RPC directly, bypassing this file entirely.

import { redirect } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/authz";
import { serverOnlyEnv } from "@/lib/env";

export async function requireOwnerOrSuperadmin(hotelId: string, organizationId: string): Promise<CurrentUser> {
  const user = await requireUser();

  if (user.platformRole === "superadmin") {
    return user;
  }
  if (user.platformRole) {
    // Deliberately excludes 'admin' and 'moderator' — see module comment above.
    redirect("/forbidden");
  }

  const isOwner = user.memberships.some(
    (m) => m.roleKey === "hotel_owner" && (m.hotelId === hotelId || (m.hotelId === null && m.organizationId === organizationId)),
  );
  if (!isOwner) {
    redirect("/forbidden");
  }
  return user;
}

export function isDemoDataSeedingEnabled(): boolean {
  return serverOnlyEnv().ENABLE_DEMO_DATA_SEEDING;
}

export function requireDemoDataSeedingEnabled(): void {
  if (!isDemoDataSeedingEnabled()) {
    throw new Error(
      "Test-data seeding is disabled in this environment (ENABLE_DEMO_DATA_SEEDING is not set to true). This is a safety default — never enable it in a deployment serving real tenants.",
    );
  }
}
