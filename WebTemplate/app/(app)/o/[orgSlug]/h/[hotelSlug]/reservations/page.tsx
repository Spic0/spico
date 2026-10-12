import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { RESERVATION_STATUSES, formatMoney } from "@/lib/pms";
import { StatusChip } from "@/components/ui/StatusChip";

const FILTERS = [{ value: "all", label: "All" }, ...RESERVATION_STATUSES];

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const { status: statusFilter = "all" } = await searchParams;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("reservations.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "reservations.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  let query = supabase
    .from("reservations")
    .select("id, confirmation_code, guest_id, room_type_id, check_in_date, check_out_date, status, total_amount, currency")
    .eq("hotel_id", hotel.id)
    .order("check_in_date", { ascending: false })
    .limit(300);
  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  const { data: reservations, error } = await query;
  if (error) throw new Error(`Failed to load reservations: ${error.message}`);

  const rows = reservations ?? [];
  const guestIds = Array.from(new Set(rows.map((r) => r.guest_id)));
  const typeIds = Array.from(new Set(rows.map((r) => r.room_type_id)));
  const [{ data: guests }, { data: types }] = await Promise.all([
    guestIds.length
      ? supabase.from("guests").select("id, first_name, last_name").in("id", guestIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    typeIds.length
      ? supabase.from("room_types").select("id, name").in("id", typeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const guestName = new Map((guests ?? []).map((g) => [g.id, `${g.last_name}, ${g.first_name}`]));
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));

  const base = `/o/${orgSlug}/h/${hotelSlug}/reservations`;

  return (
    <div className="pt--40">
      <div className="spico-inline-form" style={{ justifyContent: "space-between" }}>
        <h4 className="title">{hotel.name} — Reservations</h4>
        {canManage && (
          <Link href={`${base}/new`} className="rts-btn btn-primary">
            New reservation
          </Link>
        )}
      </div>

      <div className="spico-tab-nav">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`${base}?status=${f.value}`}
            className={`spico-tab-nav-item ${statusFilter === f.value ? "active" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Guest</th>
            <th>Room type</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Status</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`${base}/${r.id}`}>{r.confirmation_code}</Link>
              </td>
              <td>{guestName.get(r.guest_id) ?? "—"}</td>
              <td>{typeName.get(r.room_type_id) ?? "—"}</td>
              <td>{r.check_in_date}</td>
              <td>{r.check_out_date}</td>
              <td>
                <StatusChip status={r.status} />
              </td>
              <td>{formatMoney(r.total_amount, r.currency)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7}>No reservations{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""} yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
