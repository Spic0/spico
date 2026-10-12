// Milestone 12: plan-limit enforcement. Reads the organization's active
// subscription + plan (never a hardcoded limit in application code — see
// docs/assumptions.md M10 #9, the gap this closes) and reports whether a new
// hotel or a new active membership may be created. Blocks only NEW creation
// — never existing access, per the mandatory rule. A missing subscription
// row fails CLOSED (every organization is auto-seeded one on creation via
// seed_default_subscription(), so a missing row is itself an anomaly, not a
// normal "unlimited" state to silently allow).
//
// bypassPlanLimits is a named option the caller must explicitly pass — never
// a default — and should only ever be passed from a code path that has
// already re-verified platformRole === 'superadmin' immediately beforehand
// (there is no such call site yet in this milestone; the option exists for
// a future admin support tool).

import { createClient } from "@/lib/supabase/server";

export interface PlanLimitCheck {
  allowed: boolean;
  reason?: string;
  limit?: number | null;
  current?: number;
}

interface BypassOptions {
  bypassPlanLimits?: true;
}

async function getActivePlanLimit(
  organizationId: string,
  field: "max_hotels" | "max_users",
): Promise<{ ok: true; limit: number | null } | { ok: false; reason: string }> {
  const supabase = await createClient();

  const { data: subscription, error: subError } = await supabase
    .from("organization_subscriptions")
    .select("plan_id")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (subError) {
    throw new Error(`Failed to read organization subscription: ${subError.message}`);
  }
  if (!subscription) {
    return {
      ok: false,
      reason: "This organization has no active subscription — contact support before creating more hotels or team members.",
    };
  }

  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("max_hotels, max_users")
    .eq("id", subscription.plan_id)
    .maybeSingle();

  if (planError) {
    throw new Error(`Failed to read plan: ${planError.message}`);
  }
  if (!plan) {
    return { ok: false, reason: "This organization's subscription plan could not be found — contact support." };
  }

  return { ok: true, limit: field === "max_hotels" ? plan.max_hotels : plan.max_users };
}

// Counts hotels in 'onboarding' or 'active' status (everything except
// 'suspended') — an org creating unlimited onboarding hotels that never
// activate would otherwise be a way around the limit.
export async function checkHotelCreationAllowed(
  organizationId: string,
  opts: BypassOptions = {},
): Promise<PlanLimitCheck> {
  if (opts.bypassPlanLimits) {
    return { allowed: true };
  }

  const planLimit = await getActivePlanLimit(organizationId, "max_hotels");
  if (!planLimit.ok) {
    return { allowed: false, reason: planLimit.reason };
  }
  if (planLimit.limit === null) {
    return { allowed: true, limit: null };
  }

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("hotels")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["onboarding", "active"]);

  if (error) {
    throw new Error(`Failed to count hotels: ${error.message}`);
  }

  const current = count ?? 0;
  if (current >= planLimit.limit) {
    return {
      allowed: false,
      reason: `This organization's plan allows up to ${planLimit.limit} hotel(s) — upgrade the plan to create another.`,
      limit: planLimit.limit,
      current,
    };
  }
  return { allowed: true, limit: planLimit.limit, current };
}

export async function checkMembershipCreationAllowed(
  organizationId: string,
  opts: BypassOptions = {},
): Promise<PlanLimitCheck> {
  if (opts.bypassPlanLimits) {
    return { allowed: true };
  }

  const planLimit = await getActivePlanLimit(organizationId, "max_users");
  if (!planLimit.ok) {
    return { allowed: false, reason: planLimit.reason };
  }
  if (planLimit.limit === null) {
    return { allowed: true, limit: null };
  }

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to count active memberships: ${error.message}`);
  }

  const current = count ?? 0;
  if (current >= planLimit.limit) {
    return {
      allowed: false,
      reason: `This organization's plan allows up to ${planLimit.limit} team member(s) — upgrade the plan to invite another.`,
      limit: planLimit.limit,
      current,
    };
  }
  return { allowed: true, limit: planLimit.limit, current };
}
