import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { ReservationWizard } from "./ReservationWizard";

export default async function NewReservationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ guestId?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const { guestId } = await searchParams;
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

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to reservations
      </Link>
      <h4 className="title mt--10">New reservation</h4>
      <ReservationWizard
        orgSlug={orgSlug}
        hotelSlug={hotelSlug}
        currency={hotel.default_currency}
        guests={guests ?? []}
        roomTypes={(roomTypes ?? []).map((t) => ({ ...t, base_rate: Number(t.base_rate) }))}
        ratePlans={(ratePlans ?? []).map((rp) => ({ ...rp, nightly_amount: Number(rp.nightly_amount) }))}
        initialGuestId={guestId}
      />
    </div>
  );
}
