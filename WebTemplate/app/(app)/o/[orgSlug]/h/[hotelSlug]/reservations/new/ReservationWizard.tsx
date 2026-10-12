"use client";

import Link from "next/link";
import { useState } from "react";
import { Wizard, Field, type WizardStep } from "@/components/ui/Wizard";
import { nightsBetween, formatMoney, todayISO } from "@/lib/pms";
import { createReservationAction } from "../actions";

type Guest = { id: string; first_name: string; last_name: string };
type RoomType = { id: string; name: string; base_rate: number };
type RatePlan = { id: string; name: string; room_type_id: string; nightly_amount: number };

// Live reservation wizard. Local state mirrors a few fields only to drive the
// nights count, the rate-plan filter and the price estimate — the inputs stay
// uncontrolled and the single form submit sends everything.
export function ReservationWizard({
  orgSlug,
  hotelSlug,
  currency,
  guests,
  roomTypes,
  ratePlans,
  initialGuestId,
}: {
  orgSlug: string;
  hotelSlug: string;
  currency: string;
  guests: Guest[];
  roomTypes: RoomType[];
  ratePlans: RatePlan[];
  initialGuestId?: string;
}) {
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState("");
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id ?? "");
  const [ratePlanId, setRatePlanId] = useState("");

  const back = `/o/${orgSlug}/h/${hotelSlug}/reservations/new`;
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const plansForType = ratePlans.filter((rp) => rp.room_type_id === roomTypeId);
  const selectedType = roomTypes.find((t) => t.id === roomTypeId);
  const selectedPlan = plansForType.find((rp) => rp.id === ratePlanId);
  const nightly = selectedPlan ? Number(selectedPlan.nightly_amount) : Number(selectedType?.base_rate ?? 0);
  const estimate = nights > 0 ? nights * nightly : 0;

  const prereq = (text: string, href: string, label: string) => (
    <div className="spico-callout">
      <p>{text}</p>
      <Link href={href} className="rts-btn btn-primary btn-sm">
        {label}
      </Link>
    </div>
  );

  const steps: WizardStep[] = [
    {
      id: "guest",
      title: "Guest",
      intro: "Who is staying? Pick an existing guest or add a new one.",
      content:
        guests.length === 0 ? (
          prereq(
            "No guests yet. Add the guest first, then you'll come straight back here.",
            `/o/${orgSlug}/h/${hotelSlug}/guests/new?returnTo=${encodeURIComponent(back)}`,
            "Add a guest",
          )
        ) : (
          <>
            <Field name="guestId" label="Guest" hint="The person the booking is for">
              <select name="guestId" required defaultValue={initialGuestId ?? ""}>
                <option value="" disabled>
                  Choose a guest…
                </option>
                {guests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.last_name}, {g.first_name}
                  </option>
                ))}
              </select>
            </Field>
            <Link
              href={`/o/${orgSlug}/h/${hotelSlug}/guests/new?returnTo=${encodeURIComponent(back)}`}
              className="rts-btn btn-ghost btn-sm"
            >
              + New guest
            </Link>
          </>
        ),
    },
    {
      id: "stay",
      title: "Stay",
      intro: "When are they arriving and leaving, and how many people?",
      content: (
        <>
          <Field name="checkInDate" label="Check-in" hint="First night, e.g. today">
            <input name="checkInDate" type="date" required defaultValue={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </Field>
          <Field name="checkOutDate" label="Check-out" hint="Day of departure — must be after check-in">
            <input name="checkOutDate" type="date" required defaultValue={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
          <p className="spico-muted">
            {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Pick both dates to see the number of nights."}
          </p>
          <div className="spico-inline-form" style={{ gap: 16 }}>
            <Field name="adults" label="Adults" hint="1–20">
              <input name="adults" type="number" min={1} max={20} defaultValue={2} />
            </Field>
            <Field name="children" label="Children" hint="0–20">
              <input name="children" type="number" min={0} max={20} defaultValue={0} />
            </Field>
          </div>
        </>
      ),
    },
    {
      id: "room",
      title: "Room & rate",
      intro: "Which room type, and at what rate? The estimate updates as you choose.",
      content:
        roomTypes.length === 0 ? (
          prereq(
            "No active room types yet. Add one under Rooms & Rates, then come back to finish the booking.",
            `/o/${orgSlug}/h/${hotelSlug}/pms`,
            "Go to Rooms & Rates",
          )
        ) : (
          <>
            <Field name="roomTypeId" label="Room type" hint="Availability is checked when you submit">
              <select
                name="roomTypeId"
                required
                defaultValue={roomTypeId}
                onChange={(e) => {
                  setRoomTypeId(e.target.value);
                  setRatePlanId("");
                }}
              >
                {roomTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {formatMoney(Number(t.base_rate), currency)}/night base
                  </option>
                ))}
              </select>
            </Field>
            <Field name="ratePlanId" label="Rate plan" hint="Optional — Base rate uses the room type's own price">
              <select name="ratePlanId" value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)}>
                <option value="">Base rate</option>
                {plansForType.map((rp) => (
                  <option key={rp.id} value={rp.id}>
                    {rp.name} — {formatMoney(Number(rp.nightly_amount), currency)}/night
                  </option>
                ))}
              </select>
            </Field>
            <p className="spico-callout">
              {nights > 0
                ? `${nights} night${nights === 1 ? "" : "s"} × ${formatMoney(nightly, currency)} = ${formatMoney(estimate, currency)}`
                : "Pick your dates to see an estimate."}{" "}
              <span className="spico-muted">(estimate — the final total may include seasonal rates)</span>
            </p>
          </>
        ),
    },
    {
      id: "notes",
      title: "Notes",
      intro: "Anything the team should know about this booking?",
      content: (
        <Field name="notes" label="Notes" hint="Optional — requests, arrival time, etc.">
          <textarea name="notes" rows={3} maxLength={2000} />
        </Field>
      ),
    },
  ];

  return (
    <Wizard action={createReservationAction} hidden={{ orgSlug, hotelSlug }} submitLabel="Create reservation" steps={steps} />
  );
}
