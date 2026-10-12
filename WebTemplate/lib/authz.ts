import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PermissionKey, PlatformRole, RoleKey } from "@/lib/supabase/types";

export interface MembershipContext {
  id: string;
  organizationId: string;
  hotelId: string | null;
  roleKey: RoleKey;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string | null;
  platformRole: PlatformRole | null;
  memberships: MembershipContext[];
}

// Resolves the signed-in user plus their profile and active memberships.
// Returns null when there is no session — callers decide whether that's an
// error (requireUser) or an expected state.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name, platform_role").eq("id", user.id).single(),
    supabase
      .from("memberships")
      .select("id, organization_id, hotel_id, role_key")
      .eq("profile_id", user.id)
      .eq("status", "active"),
  ]);

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    platformRole: profile?.platform_role ?? null,
    memberships: (memberships ?? []).map((m) => ({
      id: m.id,
      organizationId: m.organization_id,
      hotelId: m.hotel_id,
      roleKey: m.role_key,
    })),
  };
}

// Middleware already redirects unauthenticated requests to /login, but every
// Server Component/Action re-checks — middleware is a UX layer only, never
// the sole authorization boundary (see docs/rbac.md).
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requirePlatformRole(allowed: PlatformRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.platformRole || !allowed.includes(user.platformRole)) {
    redirect("/forbidden");
  }
  return user;
}

interface PermissionScope {
  hotelId?: string | null;
  organizationId?: string | null;
}

// Mirrors the RLS-enforced public.has_permission() SQL function so Server
// Actions/pages can produce a clean redirect/error instead of relying on a
// raw Postgres denial. RLS remains the ground truth for every actual query.
export async function hasPermission(
  userId: string,
  permission: PermissionKey,
  scope: PermissionScope,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    p_user_id: userId,
    p_permission: permission,
    p_hotel_id: scope.hotelId ?? null,
    p_organization_id: scope.organizationId ?? null,
  });

  if (error) {
    throw new Error(`has_permission check failed: ${error.message}`);
  }

  return Boolean(data);
}

export async function requirePermission(
  permission: PermissionKey,
  scope: PermissionScope,
): Promise<CurrentUser> {
  const user = await requireUser();
  const allowed = await hasPermission(user.id, permission, scope);
  if (!allowed) {
    redirect("/forbidden");
  }
  return user;
}
