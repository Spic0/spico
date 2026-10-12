import { statusChipVariant, humanizeStatus, type ChipVariant } from "@/lib/statusChip";

// Token-driven status chip (Phase 2, see docs/ui-audit.md). Pass a raw domain
// status ("checked_in", "suspended", …) and it resolves colour + label from
// lib/statusChip.ts; or override either with `variant` / `label`. Server
// Component (no client JS) so it drops into any table cell.
export function StatusChip({
  status,
  variant,
  label,
  dot = true,
}: {
  status: string;
  variant?: ChipVariant;
  label?: string;
  dot?: boolean;
}) {
  const resolvedVariant = variant ?? statusChipVariant(status);
  const resolvedLabel = label ?? humanizeStatus(status);
  return (
    <span className={`spico-chip is-${resolvedVariant}${dot ? "" : " is-plain"}`}>{resolvedLabel}</span>
  );
}
