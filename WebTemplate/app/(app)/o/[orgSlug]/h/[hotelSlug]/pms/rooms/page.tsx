import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { HOUSEKEEPING_STATUSES } from "@/lib/pms";
import { StatusChip } from "@/components/ui/StatusChip";
import { createRoomAction, updateRoomAction } from "./actions";

export default async function RoomsPage({
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
  const [{ data: rooms, error }, { data: roomTypes }] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, room_number, floor, room_type_id, housekeeping_status, status")
      .eq("hotel_id", hotel.id)
      .order("room_number"),
    supabase.from("room_types").select("id, name, status").eq("hotel_id", hotel.id).order("name"),
  ]);
  if (error) {
    throw new Error(`Failed to load rooms: ${error.message}`);
  }

  const typeName = new Map((roomTypes ?? []).map((t) => [t.id, t.name]));
  const activeTypes = (roomTypes ?? []).filter((t) => t.status === "active");

  return (
    <div className="mt--20">
      {activeTypes.length === 0 && <p className="spico-muted">Add a room type first, then you can add rooms.</p>}

      <table className="spico-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Type</th>
            <th>Floor</th>
            <th>Housekeeping</th>
            <th>Status</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(rooms ?? []).map((r) => (
            <tr key={r.id}>
              {canManage ? (
                <td colSpan={5}>
                  <form action={updateRoomAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="roomId" value={r.id} />
                    <input name="roomNumber" defaultValue={r.room_number} required maxLength={20} size={6} />
                    <select name="roomTypeId" defaultValue={r.room_type_id}>
                      {(roomTypes ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <input name="floor" defaultValue={r.floor ?? ""} placeholder="Floor" size={5} />
                    <select name="housekeepingStatus" defaultValue={r.housekeeping_status}>
                      {HOUSEKEEPING_STATUSES.map((h) => (
                        <option key={h.value} value={h.value}>
                          {h.label}
                        </option>
                      ))}
                    </select>
                    <select name="status" defaultValue={r.status}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <button type="submit" className="rts-btn btn-primary">
                      Save
                    </button>
                  </form>
                </td>
              ) : (
                <>
                  <td>{r.room_number}</td>
                  <td>{typeName.get(r.room_type_id) ?? "—"}</td>
                  <td>{r.floor ?? ""}</td>
                  <td>
                    <StatusChip status={r.housekeeping_status} />
                  </td>
                  <td>
                    <StatusChip status={r.status} />
                  </td>
                </>
              )}
            </tr>
          ))}
          {(rooms ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 6 : 5}>No rooms yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && activeTypes.length > 0 && (
        <>
          <h5 className="title mt--30">Add a room</h5>
          <form action={createRoomAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input name="roomNumber" placeholder="Room no." required maxLength={20} size={8} />
            <select name="roomTypeId" required aria-label="Room type">
              {activeTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input name="floor" placeholder="Floor" size={5} />
            <button type="submit" className="rts-btn btn-primary">
              Add room
            </button>
          </form>
        </>
      )}
    </div>
  );
}
