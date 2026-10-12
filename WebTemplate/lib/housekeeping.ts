// Housekeeping task board shared definitions (Milestone 11). Registry-in-code
// pattern, consistent with lib/pms.ts etc. Keep value sets in sync with the
// CHECK constraints in supabase/migrations/20260802190007_housekeeping_tasks.sql.

export type HousekeepingTaskType = "checkout_clean" | "stayover_clean" | "inspection" | "maintenance";
export type HousekeepingTaskStatus = "pending" | "in_progress" | "completed" | "verified";
export type HousekeepingTaskPriority = "low" | "normal" | "high";

export const TASK_TYPES: { value: HousekeepingTaskType; label: string }[] = [
  { value: "checkout_clean", label: "Checkout clean" },
  { value: "stayover_clean", label: "Stayover clean" },
  { value: "inspection", label: "Inspection" },
  { value: "maintenance", label: "Maintenance" },
];

export const TASK_STATUSES: { value: HousekeepingTaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "verified", label: "Verified" },
];

export const TASK_PRIORITIES: { value: HousekeepingTaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

export function taskTypeLabel(type: string): string {
  return TASK_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function taskStatusLabel(status: string): string {
  return TASK_STATUSES.find((s) => s.value === status)?.label ?? status;
}

// Valid forward transitions — used to render only the next legal action(s)
// rather than every status as a button. Tasks don't move backward.
export const NEXT_STATUS: Record<HousekeepingTaskStatus, HousekeepingTaskStatus | null> = {
  pending: "in_progress",
  in_progress: "completed",
  completed: "verified",
  verified: null,
};
