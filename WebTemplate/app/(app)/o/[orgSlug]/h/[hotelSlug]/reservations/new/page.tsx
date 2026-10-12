import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, todayISO } from "@/lib/pms";
import { createReservationAction } from "../actions";

export default async function NewReservationPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("reservations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const [{ data: guests }, { data: roomTypes }, { data: ratePlans }] = await Promise.all([
    supabase.from("guests").select("id, first_name, last_name").eq("hotel_id", hotel.id).order("last_name").limit(500),
    supabase.from("room_types").select("id, name, base_rate").eq("hotel_id", hotel.id).eq("status", "active").order("name"),
    supabase
      .from("rate_plans")
      .select("id, name, room_type_id, nightly_amount")
      .eq("hotel_id", hotel.id)
      .eq("status", "active")
      .order("name"),
  ]);

  const base = `/o/${orgSlug}/h/${hotelSlug}/reservations`;
  const currency = hotel.default_currency;
  const guestList = guests ?? [];
  const typeList = roomTypes ?? [];
  const planList = ratePlans ?? [];

  const missing: string[] = [];
  if (guestList.length === 0) missing.push("a guest (add one under Guests)");
  if (typeList.length === 0) missing.push("an active room type (add one under Rooms & Rates)");

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to reservations
      </Link>
      <h4 className="title mt--10">New reservation</h4>

      {missing.length > 0 ? (
        <p className="spico-muted">You need {missing.join(" and ")} before you can create a reservation.</p>
      ) : (
        <form action={createReservationAction} className="spico-panel spico-settings-form">
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="hotelSlug" value={hotelSlug} />
          <div className="input-wrapper">
            <label htmlFor="guestId">Guest</label>
            <select id="guestId" name="guestId" required>
              {guestList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.last_name}, {g.first_name}
                </option>
              ))}
            </select>
          </div>
          <div className="input-wrapper">
            <label htmlFor="roomTypeId">Room type</label>
            <select id="roomTypeId" name="roomTypeId" required>
              {typeList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {formatMoney(Number(t.base_rate), currency)}/night base
                </option>
              ))}
            </select>
          </div>
          <div className="input-wrapper">
            <label htmlFor="ratePlanId">Rate plan (optional — uses room type base rate if empty)</label>
            <select id="ratePlanId" name="ratePlanId">
              <option value="">Base rate</option>
              {planList.map((rp) => (
                <option key={rp.id} value={rp.id}>
                  {rp.name} — {formatMoney(Number(rp.nightly_amount), currency)}/night
                </option>
              ))}
            </select>
            <span className="spico-muted">Pick a rate plan that matches the room type above.</span>
          </div>
          <div className="input-wrapper">
            <label htmlFor="checkInDate">Check-in</label>
            <input id="checkInDate" name="checkInDate" type="date" defaultValue={todayISO()} required />
          </div>
          <div className="input-wrapper">
            <label htmlFor="checkOutDate">Check-out</label>
            <input id="checkOutDate" name="checkOutDate" type="date" required />
          </div>
          <div className="spico-inline-form">
            <label>
              Adults <input name="adults" type="number" min={1} max={20} defaultValue={2} size={3} />
            </label>
            <label>
              Children <input name="children" type="number" min={0} max={20} defaultValue={0} size={3} />
            </label>
          </div>
          <div className="input-wrapper">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={2} maxLength={2000} />
          </div>
          <button type="submit" className="rts-btn btn-primary">
            Create reservation
          </button>
          <p className="spico-muted">Availability for the room type and dates is checked when you submit.</p>
        </form>
      )}
    </div>
  );
}
