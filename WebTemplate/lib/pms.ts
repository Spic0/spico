// Reservations & PMS shared definitions (Milestone 6). Enum value sets +
// labels and pure helpers (nights, confirmation codes, money formatting).
// Registry-in-code pattern, consistent with lib/inboxChannels.ts etc. Keep the
// value sets in sync with the CHECK constraints in
// supabase/migrations/2026072814000*.sql. Availability is computed in server
// code (see the reservations actions/pages), not stored.

export type RoomTypeStatus = "active" | "inactive";
export type RoomStatus = "active" | "inactive";
export type HousekeepingStatus = "clean" | "dirty" | "inspected" | "out_of_service";
export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export const HOUSEKEEPING_STATUSES: { value: HousekeepingStatus; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Dirty" },
  { value: "inspected", label: "Inspected" },
  { value: "out_of_service", label: "Out of service" },
];

export const RESERVATION_STATUSES: { value: ReservationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked in" },
  { value: "checked_out", label: "Checked out" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

// A reservation in one of these statuses occupies inventory for its dates and
// therefore counts against availability.
export const OCCUPYING_STATUSES: ReservationStatus[] = ["pending", "confirmed", "checked_in"];

export function reservationStatusLabel(status: string): string {
  return RESERVATION_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function housekeepingStatusLabel(status: string): string {
  return HOUSEKEEPING_STATUSES.find((s) => s.value === status)?.label ?? status;
}

// Nights between two ISO dates (YYYY-MM-DD). Assumes checkOut > checkIn (the DB
// enforces this); returns at least 0.
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  const nights = Math.round((b - a) / 86400000);
  return nights > 0 ? nights : 0;
}

// Two half-open date ranges [aIn, aOut) and [bIn, bOut) overlap iff aIn < bOut
// and bIn < aOut. Used for availability and room-assignment conflict checks.
export function datesOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

export function generateConfirmationCode(): string {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatMoney(amount: number | null | undefined, currency: string): string {
  const value = typeof amount === "number" ? amount : 0;
  return `${currency} ${value.toFixed(2)}`;
}
