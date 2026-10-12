import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { updateGuestAction } from "./actions";

export default async function GuestsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("guests.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "guests.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: guests, error } = await supabase
    .from("guests")
    .select("id, first_name, last_name, email, phone, country_code, vip, notes")
    .eq("hotel_id", hotel.id)
    .order("last_name")
    .limit(200);

  if (error) {
    throw new Error(`Failed to load guests: ${error.message}`);
  }

  const base = `/o/${orgSlug}/h/${hotelSlug}/guests`;
  const guestList = guests ?? [];

  return (
    <div className="pt--40">
      <div className="spico-inline-form" style={{ justifyContent: "space-between" }}>
        <h4 className="title">{hotel.name} — Guests</h4>
        {canManage && (
          <Link href={`${base}/new`} className="rts-btn btn-primary">
            Add guest
          </Link>
        )}
      </div>

      {guestList.length === 0 ? (
        <div className="spico-panel">
          <p className="spico-muted">No guests yet — add the first one to start taking bookings.</p>
          {canManage && (
            <Link href={`${base}/new`} className="rts-btn btn-primary">
              Add guest
            </Link>
          )}
        </div>
      ) : (
        <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Country</th>
            <th>VIP</th>
            {canManage && <th>Edit</th>}
          </tr>
        </thead>
        <tbody>
          {guestList.map((g) => (
            <tr key={g.id}>
              {canManage ? (
                <td colSpan={5}>
                  <form action={updateGuestAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="guestId" value={g.id} />
                    <input name="firstName" defaultValue={g.first_name} placeholder="First" required />
                    <input name="lastName" defaultValue={g.last_name} placeholder="Last" required />
                    <input name="email" defaultValue={g.email ?? ""} placeholder="Email" />
                    <input name="phone" defaultValue={g.phone ?? ""} placeholder="Phone" />
                    <input name="countryCode" defaultValue={g.country_code ?? ""} placeholder="CC" size={3} maxLength={2} />
                    <label className="spico-muted">
                      <input type="checkbox" name="vip" defaultChecked={g.vip} /> VIP
                    </label>
                    <button type="submit" className="rts-btn btn-primary">
                      Save
                    </button>
                  </form>
                </td>
              ) : (
                <>
                  <td>
                    {g.last_name}, {g.first_name}
                  </td>
                  <td>{g.email ?? ""}</td>
                  <td>{g.phone ?? ""}</td>
                  <td>{g.country_code ?? ""}</td>
                  <td>{g.vip ? "★" : ""}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}
