import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pms";
import { StatusChip } from "@/components/ui/StatusChip";
import { createRatePlanAction, updateRatePlanAction } from "./actions";

export default async function RatePlansPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("pms.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "pms.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const [{ data: plans, error }, { data: roomTypes }] = await Promise.all([
    supabase
      .from("rate_plans")
      .select("id, name, code, room_type_id, nightly_amount, refundable, includes_breakfast, status")
      .eq("hotel_id", hotel.id)
      .order("name"),
    supabase.from("room_types").select("id, name, status").eq("hotel_id", hotel.id).order("name"),
  ]);
  if (error) {
    throw new Error(`Failed to load rate plans: ${error.message}`);
  }

  const typeName = new Map((roomTypes ?? []).map((t) => [t.id, t.name]));
  const activeTypes = (roomTypes ?? []).filter((t) => t.status === "active");
  const currency = hotel.default_currency;

  return (
    <div className="mt--20">
      {activeTypes.length === 0 && <p className="spico-muted">Add a room type first, then you can add rate plans.</p>}

      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Room type</th>
            <th>Nightly</th>
            <th>Flags</th>
            <th>Status</th>
            <th>Seasons</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(plans ?? []).map((rp) =>
            canManage ? (
              <tr key={rp.id}>
                <td colSpan={7}>
                  <form action={updateRatePlanAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="ratePlanId" value={rp.id} />
                    <input name="name" defaultValue={rp.name} required />
                    <span className="spico-muted">
                      {rp.code} · {typeName.get(rp.room_type_id) ?? "—"}
                    </span>
                    <input name="nightlyAmount" type="number" step="0.01" min="0" defaultValue={rp.nightly_amount} size={8} />
                    <label className="spico-muted">
                      <input type="checkbox" name="refundable" defaultChecked={rp.refundable} /> Refundable
                    </label>
                    <label className="spico-muted">
                      <input type="checkbox" name="includesBreakfast" defaultChecked={rp.includes_breakfast} /> Breakfast
                    </label>
                    <select name="status" defaultValue={rp.status}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <button type="submit" className="rts-btn btn-primary">
                      Save
                    </button>
                  </form>
                </td>
                <td>
                  <Link href={`/o/${orgSlug}/h/${hotelSlug}/pms/rates/${rp.id}`}>Manage seasons</Link>
                </td>
              </tr>
            ) : (
              <tr key={rp.id}>
                <td>{rp.name}</td>
                <td>{rp.code}</td>
                <td>{typeName.get(rp.room_type_id) ?? "—"}</td>
                <td>{formatMoney(rp.nightly_amount, currency)}</td>
                <td>
                  {rp.refundable ? "Refundable" : "Non-refundable"}
                  {rp.includes_breakfast ? " · Breakfast" : ""}
                </td>
                <td>
                  <StatusChip status={rp.status} />
                </td>
                <td>
                  <Link href={`/o/${orgSlug}/h/${hotelSlug}/pms/rates/${rp.id}`}>View seasons</Link>
                </td>
              </tr>
            ),
          )}
          {(plans ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 8 : 7}>No rate plans yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && activeTypes.length > 0 && (
        <>
          <h5 className="title mt--30">Add a rate plan</h5>
          <form action={createRatePlanAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input name="name" placeholder="Name, e.g. Flexible" required />
            <input name="code" placeholder="Code, e.g. FLEX" required maxLength={20} size={8} />
            <select name="roomTypeId" required aria-label="Room type">
              {activeTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input name="nightlyAmount" type="number" step="0.01" min="0" defaultValue={0} size={8} aria-label="Nightly amount" />
            <label className="spico-muted">
              <input type="checkbox" name="refundable" defaultChecked /> Refundable
            </label>
            <label className="spico-muted">
              <input type="checkbox" name="includesBreakfast" /> Breakfast
            </label>
            <button type="submit" className="rts-btn btn-primary">
              Add rate plan
            </button>
          </form>
        </>
      )}
    </div>
  );
}
