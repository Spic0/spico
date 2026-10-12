import { PageHeader } from "@/components/layout/PageHeader";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { saveBookingSettingsAction } from "./actions";

export default async function BookingSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("booking.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("booking_settings")
    .select("enabled, min_nights, max_nights, terms")
    .eq("hotel_id", hotel.id)
    .maybeSingle();

  const publicUrl = `${env.NEXT_PUBLIC_APP_URL}/book/${hotel.slug}`;
  const enabled = settings?.enabled ?? false;

  return (
    <div className="pt--40">
      <PageHeader title="Booking Engine" subtitle={`${hotel.name} · ${organization.name}`} />
      <p className="spico-muted">
        The public booking page lets guests check availability and request a booking. Requests arrive as{" "}
        <strong>pending</strong> reservations in the Reservations screen for staff to confirm. Availability and prices
        come straight from your room types, rooms, and rate plans — nothing is invented.
      </p>

      <div className="spico-callout">
        Public booking page:{" "}
        {enabled ? (
          <a href={publicUrl} target="_blank" rel="noreferrer">
            {publicUrl}
          </a>
        ) : (
          <span className="spico-muted">{publicUrl} (enable below to make it live)</span>
        )}
      </div>

      <form action={saveBookingSettingsAction} className="spico-panel spico-settings-form">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <label className="mb--10" style={{ display: "block" }}>
          <input type="checkbox" name="enabled" defaultChecked={enabled} /> Enable public online booking
        </label>
        <div className="input-wrapper">
          <label htmlFor="minNights">Minimum nights</label>
          <input id="minNights" name="minNights" type="number" min={1} max={90} defaultValue={settings?.min_nights ?? 1} />
        </div>
        <div className="input-wrapper">
          <label htmlFor="maxNights">Maximum nights</label>
          <input id="maxNights" name="maxNights" type="number" min={1} max={365} defaultValue={settings?.max_nights ?? 30} />
        </div>
        <div className="input-wrapper">
          <label htmlFor="terms">Booking terms (shown to guests)</label>
          <textarea id="terms" name="terms" rows={4} maxLength={4000} defaultValue={settings?.terms ?? ""} />
        </div>
        <button type="submit" className="rts-btn btn-primary">
          Save
        </button>
      </form>

      <p className="spico-muted">
        Add active room types, rooms, and rate plans under <strong>Rooms &amp; Rates</strong> so guests have something
        to book.
      </p>
    </div>
  );
}
