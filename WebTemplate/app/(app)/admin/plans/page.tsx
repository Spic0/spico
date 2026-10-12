import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatPlanPrice } from "@/lib/billing";
import { createPlanAction, setPlanStatusAction } from "./actions";

export default async function PlansAdminPage() {
  const user = await requirePlatformRole(["moderator", "admin", "superadmin"]);
  const canManage = user.platformRole === "superadmin";

  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select("id, key, name, description, monthly_price, currency, max_hotels, max_users, status")
    .order("sort_order");
  if (error) throw new Error(`Failed to load plans: ${error.message}`);

  return (
    <div className="pt--40">
      <PageHeader title="Plans" subtitle="Platform administration" />
      <p className="spico-muted">
        Platform-wide pricing tiers. Only superadmin can change these — a price change affects every organization.
      </p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Key</th>
            <th>Price</th>
            <th>Limits</th>
            <th>Status</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(plans ?? []).map((plan) => (
            <tr key={plan.id}>
              <td>{plan.name}</td>
              <td>{plan.key}</td>
              <td>{formatPlanPrice(Number(plan.monthly_price), plan.currency, plan.key)}</td>
              <td>
                {plan.max_hotels ?? "∞"} hotels · {plan.max_users ?? "∞"} users
              </td>
              <td>{plan.status}</td>
              {canManage && (
                <td>
                  <form action={setPlanStatusAction}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="nextStatus" value={plan.status === "active" ? "archived" : "active"} />
                    <button type="submit" className="rts-btn btn-border">
                      {plan.status === "active" ? "Archive" : "Reactivate"}
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Add a plan</h5>
          <form action={createPlanAction} className="spico-panel spico-settings-form">
            <div className="input-wrapper">
              <label htmlFor="p-key">Key</label>
              <input id="p-key" name="key" placeholder="e.g. growth" required maxLength={40} />
            </div>
            <div className="input-wrapper">
              <label htmlFor="p-name">Name</label>
              <input id="p-name" name="name" required maxLength={120} />
            </div>
            <div className="input-wrapper">
              <label htmlFor="p-description">Description</label>
              <input id="p-description" name="description" maxLength={500} />
            </div>
            <div className="input-wrapper">
              <label htmlFor="p-price">Monthly price</label>
              <input id="p-price" name="monthlyPrice" type="number" step="0.01" min="0" defaultValue={0} required />
            </div>
            <div className="spico-inline-form">
              <label>
                Max hotels <input name="maxHotels" type="number" min={1} placeholder="unlimited" size={4} />
              </label>
              <label>
                Max users <input name="maxUsers" type="number" min={1} placeholder="unlimited" size={4} />
              </label>
            </div>
            <div className="input-wrapper">
              <label htmlFor="p-features">Features (one per line)</label>
              <textarea id="p-features" name="features" rows={4} />
            </div>
            <button type="submit" className="rts-btn btn-primary">
              Add plan
            </button>
          </form>
        </>
      )}
    </div>
  );
}
