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

// Where a reservation originated. `source` is free text on the row (direct,
// booking_engine, api, test_data) plus the channel values we now tag bookings
// with when they come from the inbox/phone (email, sms, whatsapp, viber,
// web_chat, phone). Returns a label and a FULL Font Awesome class (prefix
// included — WhatsApp/Viber are brand glyphs). Unknown source → raw text.
export function reservationSource(source: string): { label: string; icon: string } {
  const map: Record<string, { label: string; icon: string }> = {
    direct: { label: "Direct", icon: "fa-solid fa-hotel" },
    booking_engine: { label: "Booking engine", icon: "fa-solid fa-globe" },
    api: { label: "API", icon: "fa-solid fa-code" },
    email: { label: "Email", icon: "fa-solid fa-envelope" },
    sms: { label: "SMS", icon: "fa-solid fa-comment-sms" },
    whatsapp: { label: "WhatsApp", icon: "fa-brands fa-whatsapp" },
    viber: { label: "Viber", icon: "fa-brands fa-viber" },
    web_chat: { label: "Web chat", icon: "fa-solid fa-comments" },
    phone: { label: "Phone", icon: "fa-solid fa-phone" },
    test_data: { label: "Test data", icon: "fa-solid fa-flask" },
  };
  return map[source] ?? { label: source, icon: "fa-solid fa-circle-question" };
}

// Add n days to an ISO date (YYYY-MM-DD) in UTC, returning an ISO date. Used
// for calendar navigation and seeded-date arithmetic so results never depend on
// the server's local timezone.
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The days of a month-view calendar grid for "YYYY-MM": full weeks starting on
// Monday that cover the whole month, so the result is always a multiple of 7
// (e.g. Oct 2026 → 35 days from 2026-09-28; Mar 2026 → 42; Feb 2027 → 28).
export function monthGridDays(month: string): string[] {
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const last = new Date(Date.UTC(year, mon, 0));
  // (getUTCDay() + 6) % 7 maps Sun..Sat (0..6) to Mon..Sun (0..6).
  const leading = (first.getUTCDay() + 6) % 7;
  const trailing = 6 - ((last.getUTCDay() + 6) % 7);
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - leading);
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + trailing);
  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
