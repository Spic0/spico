import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import {
  RESERVATION_STATUSES,
  formatMoney,
  nightsBetween,
  reservationSource,
  monthGridDays,
  todayISO,
} from "@/lib/pms";
import { statusChipVariant } from "@/lib/statusChip";
import { StatusChip } from "@/components/ui/StatusChip";

const FILTERS = [{ value: "all", label: "All" }, ...RESERVATION_STATUSES];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Shift a "YYYY-MM" by n months, in UTC.
function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type GridRow = {
  id: string;
  confirmation_code: string;
  guest_id: string;
  room_type_id: string;
  room_id: string | null;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children: number;
  status: string;
  total_amount: number;
  currency: string;
  source: string;
};

// A reservation occupies the night of day d when check_in <= d < check_out.
const occupiesNight = (r: GridRow, d: string) => r.check_in_date <= d && d < r.check_out_date;

export default async function ReservationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ status?: string; month?: string; day?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const sp = await searchParams;
  const statusFilter = sp.status ?? "all";
  const today = todayISO();
  // Invalid/absent params fall back to today's month/day.
  const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : today.slice(0, 7);
  const day = sp.day && DAY_RE.test(sp.day) ? sp.day : today;

  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("reservations.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "reservations.manage", { hotelId: hotel.id });

  const gridDays = monthGridDays(month);
  const gridStart = gridDays[0] ?? today;
  const gridEnd = gridDays[gridDays.length - 1] ?? today;
  // Widen the single range query so the selected day is always covered even if
  // it sits outside the visible grid (e.g. a hand-edited ?day=).
  const rangeStart = day < gridStart ? day : gridStart;
  const rangeEnd = day > gridEnd ? day : gridEnd;

  const supabase = await createClient();

  // One query for everything overlapping the visible range (respecting the
  // status filter), plus the existing full list below.
  let gridQuery = supabase
    .from("reservations")
    .select(
      "id, confirmation_code, guest_id, room_type_id, room_id, check_in_date, check_out_date, adults, children, status, total_amount, currency, source",
    )
    .eq("hotel_id", hotel.id)
    .lte("check_in_date", rangeEnd)
    .gte("check_out_date", rangeStart)
    .order("check_in_date")
    .limit(1000);
  if (statusFilter !== "all") gridQuery = gridQuery.eq("status", statusFilter);

  let listQuery = supabase
    .from("reservations")
    .select("id, confirmation_code, guest_id, room_type_id, check_in_date, check_out_date, status, total_amount, currency")
    .eq("hotel_id", hotel.id)
    .order("check_in_date", { ascending: false })
    .limit(300);
  if (statusFilter !== "all") listQuery = listQuery.eq("status", statusFilter);

  const [{ data: gridData, error: gridError }, { data: listData, error: listError }] = await Promise.all([
    gridQuery,
    listQuery,
  ]);
  if (gridError) throw new Error(`Failed to load reservations: ${gridError.message}`);
  if (listError) throw new Error(`Failed to load reservations: ${listError.message}`);

  const gridRows = (gridData ?? []) as GridRow[];
  const listRows = listData ?? [];

  // Lookups for both datasets in one pass each.
  const guestIds = Array.from(new Set([...gridRows, ...listRows].map((r) => r.guest_id)));
  const typeIds = Array.from(new Set([...gridRows, ...listRows].map((r) => r.room_type_id)));
  const roomIds = Array.from(new Set(gridRows.map((r) => r.room_id).filter((v): v is string => !!v)));
  const [{ data: guests }, { data: types }, { data: rooms }] = await Promise.all([
    guestIds.length
      ? supabase.from("guests").select("id, first_name, last_name, email, phone, vip").in("id", guestIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; vip: boolean }[] }),
    typeIds.length
      ? supabase.from("room_types").select("id, name").in("id", typeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    roomIds.length
      ? supabase.from("rooms").select("id, room_number").in("id", roomIds)
      : Promise.resolve({ data: [] as { id: string; room_number: string }[] }),
  ]);
  const guestById = new Map((guests ?? []).map((g) => [g.id, g]));
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));
  const roomNumber = new Map((rooms ?? []).map((r) => [r.id, r.room_number]));

  const base = `/o/${orgSlug}/h/${hotelSlug}/reservations`;
  const link = (next: { status?: string; month?: string; day?: string }) =>
    `${base}?status=${next.status ?? statusFilter}&month=${next.month ?? month}&day=${next.day ?? day}`;

  // Reservations relevant to the selected day: an occupied night, or a
  // departure that morning (check_out === day).
  const dayReservations = gridRows
    .filter((r) => occupiesNight(r, day) || r.check_out_date === day)
    .sort((a, b) => (a.check_in_date < b.check_in_date ? -1 : a.check_in_date > b.check_in_date ? 1 : 0));

  const stayKind = (r: GridRow): string =>
    r.check_in_date === day ? "Arrival" : r.check_out_date === day ? "Departure" : "In house";
  const stayVariant = (kind: string) =>
    kind === "Arrival" ? "info" : kind === "Departure" ? "neutral" : "success";

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
            href={link({ status: f.value })}
            className={`spico-tab-nav-item ${statusFilter === f.value ? "active" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Month calendar */}
      <div className="spico-panel spico-cal">
        <div className="spico-cal-head">
          <h5 className="title" style={{ margin: 0 }}>
            {monthTitle(month)}
          </h5>
          <div className="spico-cal-nav">
            <Link
              href={link({ month: shiftMonth(month, -1), day: `${shiftMonth(month, -1)}-01` })}
              className="rts-btn btn-secondary btn-sm"
              aria-label="Previous month"
            >
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </Link>
            <Link href={link({ month: today.slice(0, 7), day: today })} className="rts-btn btn-secondary btn-sm">
              Today
            </Link>
            <Link
              href={link({ month: shiftMonth(month, 1), day: `${shiftMonth(month, 1)}-01` })}
              className="rts-btn btn-secondary btn-sm"
              aria-label="Next month"
            >
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="spico-cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((w) => (
            <div key={w} className="spico-cal-weekday">
              {w}
            </div>
          ))}
        </div>

        <div className="spico-cal-grid">
          {gridDays.map((d) => {
            const dayRes = gridRows.filter((r) => occupiesNight(r, d));
            const isToday = d === today;
            const isSelected = d === day;
            const isOutside = d.slice(0, 7) !== month;
            const dayNum = Number(d.slice(8, 10));
            const classes = [
              "spico-cal-cell",
              isOutside ? "is-outside" : "",
              isToday ? "is-today" : "",
              isSelected ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <Link
                key={d}
                href={link({ day: d })}
                className={classes}
                aria-label={`${d}, ${dayRes.length} reservation${dayRes.length === 1 ? "" : "s"}`}
                aria-current={isSelected ? "date" : undefined}
              >
                <span className="spico-cal-daynum">{dayNum}</span>
                <span className="spico-cal-count" aria-hidden="true">
                  {dayRes.length > 0 ? dayRes.length : ""}
                </span>
                <span className="spico-cal-pills">
                  {dayRes.slice(0, 3).map((r) => (
                    <span key={r.id} className={`spico-cal-pill is-${statusChipVariant(r.status)}`}>
                      {guestById.get(r.guest_id)?.last_name ?? "Guest"}
                    </span>
                  ))}
                  {dayRes.length > 3 && <span className="spico-cal-more">+{dayRes.length - 3} more</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Selected-day detail */}
      <h5 className="title mt--30">{day} · arrivals, in-house &amp; departures</h5>
      <table className="spico-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Guest</th>
            <th>Stay</th>
            <th>Room</th>
            <th>Guests</th>
            <th>Source</th>
            <th>Status</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {dayReservations.map((r) => {
            const g = guestById.get(r.guest_id);
            const src = reservationSource(r.source);
            const nights = nightsBetween(r.check_in_date, r.check_out_date);
            return (
              <tr key={r.id}>
                <td>
                  <Link href={`${base}/${r.id}`}>{r.confirmation_code}</Link>
                </td>
                <td>
                  <div>
                    {g ? `${g.first_name} ${g.last_name}` : "—"} {g?.vip ? <span className="spico-vip" title="VIP">★ VIP</span> : ""}
                  </div>
                  {g?.email && <div className="spico-muted">{g.email}</div>}
                  {g?.phone && <div className="spico-muted">{g.phone}</div>}
                </td>
                <td>
                  <StatusChip status={stayKind(r)} label={stayKind(r)} variant={stayVariant(stayKind(r))} />
                  <div className="spico-muted">
                    {r.check_in_date} → {r.check_out_date} · {nights} night{nights === 1 ? "" : "s"}
                  </div>
                </td>
                <td>
                  {typeName.get(r.room_type_id) ?? "—"}
                  <div className="spico-muted">{r.room_id ? `Room ${roomNumber.get(r.room_id) ?? "?"}` : "unassigned"}</div>
                </td>
                <td>
                  {r.adults}A{r.children > 0 ? ` · ${r.children}C` : ""}
                </td>
                <td>
                  <span className="spico-source">
                    <i className={src.icon} aria-hidden="true" /> {src.label}
                  </span>
                </td>
                <td>
                  <StatusChip status={r.status} />
                </td>
                <td>{formatMoney(r.total_amount, r.currency)}</td>
              </tr>
            );
          })}
          {dayReservations.length === 0 && (
            <tr>
              <td colSpan={8}>No arrivals, stays or departures on this day.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Full list (unchanged behaviour) */}
      <h5 className="title mt--30">All reservations</h5>
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
          {listRows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`${base}/${r.id}`}>{r.confirmation_code}</Link>
              </td>
              <td>{guestById.get(r.guest_id) ? `${guestById.get(r.guest_id)!.last_name}, ${guestById.get(r.guest_id)!.first_name}` : "—"}</td>
              <td>{typeName.get(r.room_type_id) ?? "—"}</td>
              <td>{r.check_in_date}</td>
              <td>{r.check_out_date}</td>
              <td>
                <StatusChip status={r.status} />
              </td>
              <td>{formatMoney(r.total_amount, r.currency)}</td>
            </tr>
          ))}
          {listRows.length === 0 && (
            <tr>
              <td colSpan={7}>No reservations{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""} yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
