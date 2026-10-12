// Channel-manager sync shared definitions (Milestone 11). Registry-in-code
// pattern, consistent with lib/pms.ts etc. The actual "assemble what would be
// synced" logic lives in the sync server action (it needs live DB queries) —
// this file only holds the direction registry. See
// app/(app)/o/[orgSlug]/h/[hotelSlug]/integrations/connectors/[connectorId]/actions.ts.
//
// No live OTA/channel-manager connection exists — a "sync" here queries REAL
// current rates/availability/reservations and logs what WOULD be sent, but
// nothing is ever transmitted anywhere. Same stub discipline as every other
// external integration in this project (Telnyx/OpenAI in M8, connectors in M9).

export type SyncDirection = "push_rates" | "push_availability" | "pull_reservations";

export const SYNC_DIRECTIONS: { value: SyncDirection; label: string; description: string }[] = [
  { value: "push_rates", label: "Push rates", description: "Assemble current rate plans for the next 30 days." },
  {
    value: "push_availability",
    label: "Push availability",
    description: "Assemble current room-type availability for the next 30 days.",
  },
  {
    value: "pull_reservations",
    label: "Pull reservations",
    description: "Assemble reservations created via this connector's source in the last 30 days.",
  },
];

export function syncDirectionLabel(direction: string): string {
  return SYNC_DIRECTIONS.find((d) => d.value === direction)?.label ?? direction;
}
