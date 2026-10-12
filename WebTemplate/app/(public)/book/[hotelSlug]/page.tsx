import { createClient } from "@/lib/supabase/server";
import { formatMoney, nightsBetween, todayISO } from "@/lib/pms";
import { createPublicBookingAction } from "./actions";

function isValidDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ hotelSlug: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}) {
  const { hotelSlug } = await params;
  const sp = await searchParams;
  const guests = Math.max(1, Math.min(20, Number(sp.guests ?? 2) || 2));

  const supabase = await createClient();
  const { data: hotelRows } = await supabase.rpc("booking_hotel_public", { p_hotel_slug: hotelSlug });
  const hotel = hotelRows?.[0];

  if (!hotel) {
    return (
      <div className="spico-book-container">
        <h1 className="title">Hotel not found</h1>
      </div>
    );
  }
  if (!hotel.enabled) {
    return (
      <div className="spico-book-container">
        <h1 className="title">{hotel.name}</h1>
        <p className="spico-muted">Online booking is not available for this hotel right now.</p>
      </div>
    );
  }

  const hasSearch = isValidDate(sp.checkIn) && isValidDate(sp.checkOut) && sp.checkIn! < sp.checkOut!;
  const nights = hasSearch ? nightsBetween(sp.checkIn!, sp.checkOut!) : 0;

  let offers: {
    room_type_id: string;
    name: string;
    description: string | null;
    max_occupancy: number;
    nightly_from: number;
    available: number;
  }[] = [];
  const ratePlansByType = new Map<
    string,
    { rate_plan_id: string; name: string; nightly_amount: number; refundable: boolean; includes_breakfast: boolean }[]
  >();

  if (hasSearch) {
    const { data } = await supabase.rpc("booking_room_type_offers", {
      p_hotel_id: hotel.hotel_id,
      p_check_in: sp.checkIn!,
      p_check_out: sp.checkOut!,
      p_guests: guests,
    });
    offers = (data ?? []).filter((o) => o.available > 0);

    await Promise.all(
      offers.map(async (o) => {
        const { data: plans } = await supabase.rpc("booking_rate_plans_public", {
          p_hotel_id: hotel.hotel_id,
          p_room_type_id: o.room_type_id,
        });
        ratePlansByType.set(o.room_type_id, plans ?? []);
      }),
    );
  }

  return (
    <div className="spico-book-container">
      <h1 className="title">{hotel.name}</h1>
      <p className="spico-muted">Book your stay. Requests are confirmed by the hotel.</p>

      <form method="get" className="spico-panel spico-book-search">
        <div className="input-wrapper">
          <label htmlFor="checkIn">Check-in</label>
          <input id="checkIn" name="checkIn" type="date" min={todayISO()} defaultValue={sp.checkIn ?? todayISO()} required />
        </div>
        <div className="input-wrapper">
          <label htmlFor="checkOut">Check-out</label>
          <input id="checkOut" name="checkOut" type="date" min={todayISO()} defaultValue={sp.checkOut ?? ""} required />
        </div>
        <div className="input-wrapper">
          <label htmlFor="guests">Guests</label>
          <input id="guests" name="guests" type="number" min={1} max={20} defaultValue={guests} />
        </div>
        <button type="submit" className="rts-btn btn-primary">
          Search
        </button>
      </form>

      {hasSearch && (
        <>
          <p className="spico-muted">
            {sp.checkIn} → {sp.checkOut} · {nights} night{nights === 1 ? "" : "s"} · {guests} guest(s)
          </p>
          {offers.length === 0 ? (
            <p>No rooms available for these dates. Try different dates.</p>
          ) : (
            offers.map((o) => {
              const plans = ratePlansByType.get(o.room_type_id) ?? [];
              return (
                <div className="spico-panel" key={o.room_type_id}>
                  <h3 className="title">{o.name}</h3>
                  {o.description && <p>{o.description}</p>}
                  <p className="spico-muted">
                    Sleeps up to {o.max_occupancy} · from {formatMoney(Number(o.nightly_from), hotel.currency)}/night ·{" "}
                    {o.available} left
                  </p>

                  <form action={createPublicBookingAction} className="spico-settings-form">
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="roomTypeId" value={o.room_type_id} />
                    <input type="hidden" name="checkIn" value={sp.checkIn} />
                    <input type="hidden" name="checkOut" value={sp.checkOut} />
                    {plans.length > 0 && (
                      <div className="input-wrapper">
                        <label>Rate</label>
                        <select name="ratePlanId">
                          <option value="">Standard — {formatMoney(Number(o.nightly_from), hotel.currency)}/night</option>
                          {plans.map((rp) => (
                            <option key={rp.rate_plan_id} value={rp.rate_plan_id}>
                              {rp.name} — {formatMoney(Number(rp.nightly_amount), hotel.currency)}/night
                              {rp.includes_breakfast ? " · breakfast" : ""}
                              {rp.refundable ? " · refundable" : " · non-refundable"}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="spico-inline-form">
                      <input name="firstName" placeholder="First name" required maxLength={120} />
                      <input name="lastName" placeholder="Last name" required maxLength={120} />
                    </div>
                    <div className="spico-inline-form">
                      <input name="email" type="email" placeholder="Email" />
                      <input name="phone" placeholder="Phone" />
                    </div>
                    <div className="spico-inline-form">
                      <label>
                        Adults <input name="adults" type="number" min={1} max={o.max_occupancy} defaultValue={Math.min(guests, o.max_occupancy)} size={3} />
                      </label>
                      <label>
                        Children <input name="children" type="number" min={0} max={o.max_occupancy} defaultValue={0} size={3} />
                      </label>
                    </div>
                    <button type="submit" className="rts-btn btn-primary">
                      Request booking
                    </button>
                  </form>
                </div>
              );
            })
          )}
        </>
      )}

      {hotel.terms && (
        <div className="spico-callout">
          <strong>Booking terms</strong>
          <p className="spico-muted" style={{ whiteSpace: "pre-wrap" }}>
            {hotel.terms}
          </p>
        </div>
      )}
    </div>
  );
}
