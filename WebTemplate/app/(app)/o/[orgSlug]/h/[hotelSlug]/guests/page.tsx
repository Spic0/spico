import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { createGuestAction, updateGuestAction } from "./actions";

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

  return (
    <div className="pt--40">
      <h4 className="title">{hotel.name} — Guests</h4>

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
          {(guests ?? []).map((g) => (
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
          {(guests ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 6 : 5}>No guests yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Add a guest</h5>
          <form action={createGuestAction} className="spico-panel spico-settings-form">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <div className="input-wrapper">
              <label htmlFor="g-first">First name</label>
              <input id="g-first" name="firstName" required maxLength={120} />
            </div>
            <div className="input-wrapper">
              <label htmlFor="g-last">Last name</label>
              <input id="g-last" name="lastName" required maxLength={120} />
            </div>
            <div className="input-wrapper">
              <label htmlFor="g-email">Email</label>
              <input id="g-email" name="email" type="email" />
            </div>
            <div className="input-wrapper">
              <label htmlFor="g-phone">Phone</label>
              <input id="g-phone" name="phone" />
            </div>
            <div className="input-wrapper">
              <label htmlFor="g-cc">Country code (2 letters)</label>
              <input id="g-cc" name="countryCode" maxLength={2} placeholder="e.g. DE" />
            </div>
            <label className="spico-muted">
              <input type="checkbox" name="vip" /> VIP guest
            </label>
            <div className="input-wrapper">
              <label htmlFor="g-notes">Notes</label>
              <textarea id="g-notes" name="notes" rows={2} maxLength={2000} />
            </div>
            <button type="submit" className="rts-btn btn-primary">
              Add guest
            </button>
          </form>
        </>
      )}
    </div>
  );
}
