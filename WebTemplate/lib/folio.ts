// Folio & billing shared definitions (Milestone 11). Registry-in-code
// pattern, consistent with lib/pms.ts etc. provider is always 'stub' — no
// live payment gateway is connected (same discipline as lib/billing.ts's M10
// platform-subscription billing); recording a payment here means staff noted
// cash/card/transfer was received, not that a card was actually charged.

export type FolioStatus = "open" | "closed";
export type FolioLineCategory = "room" | "tax" | "extra" | "adjustment";
export type FolioPaymentMethod = "cash" | "card" | "bank_transfer" | "other";
export type FolioPaymentStatus = "completed" | "refunded";

export const FOLIO_LINE_CATEGORIES: { value: FolioLineCategory; label: string }[] = [
  { value: "room", label: "Room charge" },
  { value: "tax", label: "Tax" },
  { value: "extra", label: "Extra" },
  { value: "adjustment", label: "Adjustment" },
];

export const PAYMENT_METHODS: { value: FolioPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export function folioLineCategoryLabel(category: string): string {
  return FOLIO_LINE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

export interface FolioBalanceInput {
  lineItems: { amount: number }[];
  payments: { amount: number; status: string }[];
}

export function computeFolioBalance({ lineItems, payments }: FolioBalanceInput): {
  charged: number;
  paid: number;
  balance: number;
} {
  const charged = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const paid = payments.filter((p) => p.status === "completed").reduce((sum, p) => sum + p.amount, 0);
  return { charged: Math.round(charged * 100) / 100, paid: Math.round(paid * 100) / 100, balance: Math.round((charged - paid) * 100) / 100 };
}
