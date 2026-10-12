"use client";

import { useState } from "react";
import { WizardDialog, Field, type WizardStep } from "@/components/ui/WizardDialog";
import { nightsBetween, formatMoney, todayISO } from "@/lib/pms";
import { createReservationAction } from "./actions";
import { GuestDialog } from "../guests/GuestDialog";

type Guest = { id: string; first_name: string; last_name: string };
type RoomType = { id: string; name: string; base_rate: number };
type RatePlan = { id: string; name: string; room_type_id: string; nightly_amount: number };

// Reservation wizard as a modal popup (see components/ui/WizardDialog). Local
// state mirrors a few fields only to drive the nights count, the rate-plan
// filter and the price estimate — the inputs stay uncontrolled-ish and the
// single form submit sends everything. "New guest" opens a second popup
// (GuestDialog) whose success reopens this wizard with the guest preselected.
export function ReservationDialog({
  orgSlug,
  hotelSlug,
  currency,
  guests,
  roomTypes,
  ratePlans,
  initialGuestId,
  defaultOpen = false,
}: {
  orgSlug: string;
  hotelSlug: string;
  currency: string;
  guests: Guest[];
  roomTypes: RoomType[];
  ratePlans: RatePlan[];
  initialGuestId?: string;
  defaultOpen?: boolean;
}) {
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState("");
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id ?? "");
  const [ratePlanId, setRatePlanId] = useState("");

  // Reopen this wizard (with the new guest preselected) after adding a guest.
  const reopenWithGuest = `/o/${orgSlug}/h/${hotelSlug}/reservations?create=1`;
  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const plansForType = ratePlans.filter((rp) => rp.room_type_id === roomTypeId);
  const selectedType = roomTypes.find((t) => t.id === roomTypeId);
  const selectedPlan = plansForType.find((rp) => rp.id === ratePlanId);
  const nightly = selectedPlan ? Number(selectedPlan.nightly_amount) : Number(selectedType?.base_rate ?? 0);
  const estimate = nights > 0 ? nights * nightly : 0;

  const steps: WizardStep[] = [
    {
      id: "guest",
      title: "Guest",
      icon: "fa-solid fa-user",
      desc: "Who is staying",
      intro: "Who is staying? Pick an existing guest or add a new one.",
      content:
        guests.length === 0 ? (
          <div className="spico-callout">
            <p>No guests yet. Add the guest first — you&apos;ll come straight back here with them selected.</p>
            <GuestDialog orgSlug={orgSlug} hotelSlug={hotelSlug} returnTo={reopenWithGuest} />
          </div>
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
            <GuestDialog orgSlug={orgSlug} hotelSlug={hotelSlug} returnTo={reopenWithGuest} />
          </>
        ),
    },
    {
      id: "stay",
      title: "Stay",
      icon: "fa-solid fa-calendar-days",
      desc: "Dates & guests",
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
      icon: "fa-solid fa-bed",
      desc: "Type & price",
      intro: "Which room type, and at what rate? The estimate updates as you choose.",
      content:
        roomTypes.length === 0 ? (
          <div className="spico-callout">
            <p>No active room types yet. Add one under Rooms &amp; Rates, then come back to finish the booking.</p>
          </div>
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
      icon: "fa-solid fa-note-sticky",
      desc: "Anything to add",
      intro: "Anything the team should know about this booking?",
      content: (
        <Field name="notes" label="Notes" hint="Optional — requests, arrival time, etc.">
          <textarea name="notes" rows={3} maxLength={2000} />
        </Field>
      ),
    },
  ];

  return (
    <WizardDialog
      trigger="New reservation"
      title="New reservation"
      action={createReservationAction}
      hidden={{ orgSlug, hotelSlug }}
      submitLabel="Create reservation"
      steps={steps}
      defaultOpen={defaultOpen}
    />
  );
}
