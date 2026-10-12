"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { processStubPayment } from "@/lib/billing";
import { flash } from "@/lib/flash";

const schema = z.object({
  orgSlug: z.string().min(1),
  planId: z.string().min(1, "Choose a plan"),
});

export async function changePlanAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    planId: formData.get("planId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const user = await requirePermission("billing.manage", { organizationId: organization.id });

  const supabase = await createClient();
  const { data: plan } = await supabase.from("plans").select("id, key, name").eq("id", p.planId).eq("status", "active").single();
  if (!plan) {
    await flash("error", "Selected plan is not available");
    return;
  }

  const { data: before } = await supabase
    .from("organization_subscriptions")
    .select("plan_id, status")
    .eq("organization_id", organization.id)
    .single();

  // Stub — see lib/billing.ts. No live payment gateway; the plan changes
  // immediately regardless of what this reports.
  const payment = await processStubPayment();

  const { error } = await supabase
    .from("organization_subscriptions")
    .update({ plan_id: plan.id, status: "active", updated_by: user.id })
    .eq("organization_id", organization.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", `Plan changed to ${plan.name}`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "organization.plan_changed",
    targetType: "organization_subscription",
    targetId: organization.id,
    organizationId: organization.id,
    before,
    after: { plan_id: plan.id, plan_key: plan.key, charged: payment.charged, note: payment.note },
  });
}
