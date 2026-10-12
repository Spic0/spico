import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pms";
import { StatusChip } from "@/components/ui/StatusChip";
import { createRoomTypeAction, updateRoomTypeAction, setRoomTypeStatusAction } from "./actions";

export default async function RoomTypesPage({
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
  const [{ data: roomTypes, error }, { data: rooms }] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name, code, description, max_occupancy, base_rate, status")
      .eq("hotel_id", hotel.id)
      .order("name"),
    supabase.from("rooms").select("room_type_id").eq("hotel_id", hotel.id).eq("status", "active"),
  ]);
  if (error) {
    throw new Error(`Failed to load room types: ${error.message}`);
  }

  const roomCount = new Map<string, number>();
  for (const r of rooms ?? []) roomCount.set(r.room_type_id, (roomCount.get(r.room_type_id) ?? 0) + 1);
  const currency = hotel.default_currency;

  return (
    <div className="mt--20">
      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Max occ.</th>
            <th>Base rate</th>
            <th>Rooms</th>
            <th>Status</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(roomTypes ?? []).map((rt) => (
            <tr key={rt.id}>
              {canManage ? (
                <td colSpan={4}>
                  <form action={updateRoomTypeAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="roomTypeId" value={rt.id} />
                    <input name="name" defaultValue={rt.name} placeholder="Name" required />
                    <input name="code" defaultValue={rt.code} placeholder="Code" required maxLength={20} size={8} />
                    <input name="maxOccupancy" type="number" defaultValue={rt.max_occupancy} min={1} max={20} size={3} />
                    <input name="baseRate" type="number" step="0.01" min="0" defaultValue={rt.base_rate} size={8} />
                    <input name="description" defaultValue={rt.description ?? ""} placeholder="Description" />
                    <button type="submit" className="rts-btn btn-primary">
                      Save
                    </button>
                  </form>
                </td>
              ) : (
                <>
                  <td>{rt.name}</td>
                  <td>{rt.code}</td>
                  <td>{rt.max_occupancy}</td>
                  <td>{formatMoney(rt.base_rate, currency)}</td>
                </>
              )}
              <td>{roomCount.get(rt.id) ?? 0}</td>
              <td>
                <StatusChip status={rt.status} />
              </td>
              {canManage && (
                <td>
                  <form action={setRoomTypeStatusAction}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="roomTypeId" value={rt.id} />
                    <input type="hidden" name="nextStatus" value={rt.status === "active" ? "inactive" : "active"} />
                    <button type="submit" className="rts-btn btn-border">
                      {rt.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {(roomTypes ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 7 : 6}>No room types yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Add a room type</h5>
          <form action={createRoomTypeAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input name="name" placeholder="Name, e.g. Deluxe" required />
            <input name="code" placeholder="Code, e.g. DLX" required maxLength={20} size={8} />
            <input name="maxOccupancy" type="number" defaultValue={2} min={1} max={20} size={3} aria-label="Max occupancy" />
            <input name="baseRate" type="number" step="0.01" min="0" defaultValue={0} size={8} aria-label="Base rate" />
            <input name="description" placeholder="Description (optional)" />
            <button type="submit" className="rts-btn btn-primary">
              Add room type
            </button>
          </form>
          <p className="spico-muted">Base rate is in the hotel currency ({currency}).</p>
        </>
      )}
    </div>
  );
}
