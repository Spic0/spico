import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { formatPlanPrice } from "@/lib/billing";
import { StatusChip } from "@/components/ui/StatusChip";
import { changePlanAction } from "./actions";

// Pricing-tier grid + FAQ accordion, ported from the template's
// ManageSubscription page (see docs/template-audit.md) — reimplemented with
// native <details>/<summary> for the accordion rather than Bootstrap's JS Tab
// component, consistent with M1's decision to drop react-bootstrap once
// nothing needed its JS behavior.
const FAQ = [
  { q: "What happens if I change plans?", a: "Your plan changes immediately. This is a foundation feature — no payment is actually processed yet (see below)." },
  { q: "Is my card charged?", a: "No. No live payment gateway is connected yet, so plan changes are free/unpaid in this milestone." },
  { q: "Can I cancel anytime?", a: "Plan changes (including moving to Starter) are immediate and reversible — there's no lock-in." },
];

export default async function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const user = await requirePermission("billing.read", { organizationId: organization.id });
  const canManage = await hasPermission(user.id, "billing.manage", { organizationId: organization.id });

  const supabase = await createClient();
  const [{ data: subscription }, { data: plans }] = await Promise.all([
    supabase.from("organization_subscriptions").select("plan_id, status, current_period_end").eq("organization_id", organization.id).maybeSingle(),
    supabase.from("plans").select("id, key, name, description, monthly_price, currency, max_hotels, max_users, features").eq("status", "active").order("sort_order"),
  ]);

  const currentPlan = (plans ?? []).find((p) => p.id === subscription?.plan_id);

  return (
    <div className="pt--40">
      <h4 className="title">{organization.name} — Billing</h4>
      <p className="spico-muted">
        No live payment gateway is connected — plan changes below are immediate and unpaid. See docs/roadmap.md (M10).
      </p>

      <div className="spico-panel">
        <p style={{ display: "inline-flex", alignItems: "center", gap: 10, margin: 0 }}>
          <strong>Current plan: {currentPlan?.name ?? "—"}</strong>
          {subscription && <StatusChip status={subscription.status} />}
        </p>
        {subscription?.current_period_end && (
          <p className="spico-muted">Renews {new Date(subscription.current_period_end).toLocaleDateString()}</p>
        )}
      </div>

      <h5 className="title mt--30">Plans</h5>
      <div className="spico-plan-grid">
        {(plans ?? []).map((plan) => {
          const isCurrent = plan.id === subscription?.plan_id;
          return (
            <div key={plan.id} className={`spico-plan-card${isCurrent ? " spico-plan-card-current" : ""}`}>
              <h5 className="title">{plan.name}</h5>
              <div className="spico-plan-price">{formatPlanPrice(Number(plan.monthly_price), plan.currency, plan.key)}</div>
              {plan.description && <p className="spico-muted">{plan.description}</p>}
              <ul className="spico-plain-list">
                {(plan.features as string[]).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="spico-badge-active">Current plan</span>
              ) : (
                canManage && (
                  <form action={changePlanAction}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="planId" value={plan.id} />
                    <button type="submit" className="rts-btn btn-primary">
                      Switch to {plan.name}
                    </button>
                  </form>
                )
              )}
            </div>
          );
        })}
      </div>

      <h5 className="title mt--30">FAQ</h5>
      <div className="spico-faq">
        {FAQ.map((item) => (
          <details key={item.q} className="spico-faq-item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
