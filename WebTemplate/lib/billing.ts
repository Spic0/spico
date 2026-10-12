// Billing shared definitions (Milestone 10). Registry-in-code pattern,
// consistent with lib/inboxChannels.ts etc. No live payment gateway exists —
// every plan change in this milestone is an immediate, unpaid database
// update. processPayment() is a stub, mirroring the M5/M8/M9 stub-adapter
// pattern: it makes no network call and always reports that nothing was
// actually charged.

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export type PlanStatus = "active" | "archived";

export const SUBSCRIPTION_STATUSES: { value: SubscriptionStatus; label: string }[] = [
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
];

export function subscriptionStatusLabel(status: string): string {
  return SUBSCRIPTION_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function formatPlanPrice(monthlyPrice: number, currency: string, planKey: string): string {
  if (planKey === "enterprise") return "Contact us";
  if (monthlyPrice === 0) return "Free";
  return `${currency} ${monthlyPrice.toFixed(0)}/mo`;
}

export interface StubPaymentResult {
  charged: boolean;
  note: string;
}

// Stub payment adapter. A real implementation would create a checkout
// session / charge a saved payment method via a live gateway (Stripe, etc.)
// before the plan actually changes. This one never contacts anything and
// never charges — the caller changes plan_id immediately regardless.
export async function processStubPayment(): Promise<StubPaymentResult> {
  return {
    charged: false,
    note: "stub: no live payment gateway is connected — this plan change was not charged",
  };
}
