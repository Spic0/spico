import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { OCCUPYING_STATUSES, formatMoney, nightsBetween, reservationSource } from "@/lib/pms";
import { channelTypeLabel, channelTypeIcon } from "@/lib/inboxChannels";
import { computeFolioBalance, folioLineCategoryLabel, paymentMethodLabel } from "@/lib/folio";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  setReservationStatusAction,
  checkInReservationAction,
  checkOutReservationAction,
} from "../actions";
import { addFolioChargeAction, recordFolioPaymentAction, closeFolioAction } from "./actions";

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; reservationId: string }>;
}) {
  const { orgSlug, hotelSlug, reservationId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("reservations.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "reservations.manage", { hotelId: hotel.id });
  const [canViewFolio, canManageFolio] = await Promise.all([
    hasPermission(user.id, "folio.read", { hotelId: hotel.id }),
    hasPermission(user.id, "folio.manage", { hotelId: hotel.id }),
  ]);

  const supabase = await createClient();
  const { data: r } = await supabase
    .from("reservations")
    .select(
      "id, confirmation_code, guest_id, room_type_id, room_id, rate_plan_id, check_in_date, check_out_date, adults, children, status, total_amount, currency, source, conversation_id, call_id, notes",
    )
    .eq("id", reservationId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!r) notFound();

  // Origin: the conversation or call this booking came from. Both are
  // RLS-gated — a user without inbox.view / calls.read sees null here and the
  // Origin panel then shows just the source label.
  const [{ data: originConversation }, { data: originCall }] = await Promise.all([
    r.conversation_id
      ? supabase.from("conversations").select("id, subject, channel_id").eq("id", r.conversation_id).maybeSingle()
      : Promise.resolve({ data: null as { id: string; subject: string | null; channel_id: string } | null }),
    r.call_id
      ? supabase
          .from("calls")
          .select("id, direction, from_number, to_number, started_at, duration_seconds")
          .eq("id", r.call_id)
          .maybeSingle()
      : Promise.resolve({
          data: null as {
            id: string;
            direction: string;
            from_number: string | null;
            to_number: string | null;
            started_at: string;
            duration_seconds: number;
          } | null,
        }),
  ]);
  const { data: originChannel } = originConversation
    ? await supabase.from("channels").select("channel_type, name").eq("id", originConversation.channel_id).maybeSingle()
    : { data: null as { channel_type: string; name: string } | null };

  const [{ data: guest }, { data: roomType }, { data: assignedRoom }] = await Promise.all([
    supabase.from("guests").select("first_name, last_name, email, phone, vip").eq("id", r.guest_id).single(),
    supabase.from("room_types").select("name").eq("id", r.room_type_id).single(),
    r.room_id
      ? supabase.from("rooms").select("room_number").eq("id", r.room_id).single()
      : Promise.resolve({ data: null as { room_number: string } | null }),
  ]);

  // For check-in: active rooms of this type not already assigned to another
  // overlapping occupying reservation.
  let availableRooms: { id: string; room_number: string }[] = [];
  if (canManage && ["pending", "confirmed"].includes(r.status)) {
    const [{ data: rooms }, { data: conflicts }] = await Promise.all([
      supabase
        .from("rooms")
        .select("id, room_number")
        .eq("hotel_id", hotel.id)
        .eq("room_type_id", r.room_type_id)
        .eq("status", "active")
        .neq("housekeeping_status", "out_of_service")
        .order("room_number"),
      supabase
        .from("reservations")
        .select("room_id")
        .eq("hotel_id", hotel.id)
        .in("status", OCCUPYING_STATUSES)
        .neq("id", r.id)
        .not("room_id", "is", null)
        .lt("check_in_date", r.check_out_date)
        .gt("check_out_date", r.check_in_date),
    ]);
    const taken = new Set((conflicts ?? []).map((c) => c.room_id));
    availableRooms = (rooms ?? []).filter((room) => !taken.has(room.id));
  }

  let folio: { id: string; status: string } | null = null;
  let lineItems: { id: string; category: string; description: string; service_date: string | null; quantity: number; unit_amount: number; amount: number }[] = [];
  let payments: { id: string; amount: number; method: string; status: string; created_at: string }[] = [];
  if (canViewFolio) {
    const { data: folioRow } = await supabase.from("folios").select("id, status").eq("hotel_id", hotel.id).eq("reservation_id", r.id).maybeSingle();
    folio = folioRow;
    if (folio) {
      const [{ data: lines }, { data: pays }] = await Promise.all([
        supabase
          .from("folio_line_items")
          .select("id, category, description, service_date, quantity, unit_amount, amount")
          .eq("folio_id", folio.id)
          .order("service_date"),
        supabase
          .from("folio_payments")
          .select("id, amount, method, status, created_at")
          .eq("folio_id", folio.id)
          .order("created_at"),
      ]);
      lineItems = lines ?? [];
      payments = pays ?? [];
    }
  }
  const balance = computeFolioBalance({ lineItems, payments });

  const hotelBase = `/o/${orgSlug}/h/${hotelSlug}`;
  const base = `${hotelBase}/reservations`;
  const nights = nightsBetween(r.check_in_date, r.check_out_date);
  const isClosed = ["checked_out", "cancelled", "no_show"].includes(r.status);
  const source = reservationSource(r.source);

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to reservations
      </Link>
      <div className="spico-inline-form" style={{ justifyContent: "space-between", marginTop: 10 }}>
        <h4 className="title" style={{ margin: 0 }}>
          {r.confirmation_code}
        </h4>
        <StatusChip status={r.status} />
      </div>

      <div className="spico-panel">
        <p>
          <strong>
            {guest ? `${guest.first_name} ${guest.last_name}` : "Guest"} {guest?.vip ? "★" : ""}
          </strong>
          {guest?.email ? ` · ${guest.email}` : ""}
          {guest?.phone ? ` · ${guest.phone}` : ""}
        </p>
        <p className="spico-muted">
          {roomType?.name ?? "Room type"} · {r.check_in_date} → {r.check_out_date} ({nights} night
          {nights === 1 ? "" : "s"}) · {r.adults} adult(s), {r.children} child(ren)
        </p>
        <p className="spico-muted">
          Room: {assignedRoom?.room_number ?? "not assigned"} · Total: {formatMoney(r.total_amount, r.currency)}
        </p>
        {r.notes && <p>{r.notes}</p>}
      </div>

      <div className="spico-panel">
        <strong>Origin</strong>
        <div className="mt--10">
          <span className="spico-source">
            <i className={source.icon} aria-hidden="true" /> {source.label}
          </span>
        </div>

        {originConversation && (
          <div className="spico-origin-link">
            <span className="spico-source">
              <i className={channelFaClass(originChannel?.channel_type)} aria-hidden="true" />{" "}
              {originChannel ? channelTypeLabel(originChannel.channel_type) : "Conversation"}
            </span>
            {originConversation.subject && <div className="spico-muted">{originConversation.subject}</div>}
            <Link href={`${hotelBase}/inbox/${originConversation.id}`} className="rts-btn btn-secondary btn-sm mt--10">
              <i className="fa-solid fa-up-right-from-square" aria-hidden="true" /> Open conversation
            </Link>
          </div>
        )}

        {originCall && (
          <div className="spico-origin-link">
            <span className="spico-source">
              <i className="fa-solid fa-phone" aria-hidden="true" />{" "}
              {originCall.direction === "inbound" ? "Inbound" : "Outbound"} call
              {originCall.from_number || originCall.to_number
                ? ` · ${originCall.direction === "inbound" ? originCall.from_number : originCall.to_number}`
                : ""}
            </span>
            <div className="spico-muted">
              {new Date(originCall.started_at).toLocaleString()} · {formatDuration(originCall.duration_seconds)}
            </div>
            <Link href={`${hotelBase}/calls/${originCall.id}`} className="rts-btn btn-secondary btn-sm mt--10">
              <i className="fa-solid fa-up-right-from-square" aria-hidden="true" /> Open call recording
            </Link>
          </div>
        )}
      </div>

      {canManage && !isClosed && (
        <div className="spico-two-col">
          {["pending", "confirmed"].includes(r.status) && (
            <div className="spico-panel">
              <strong>Check in</strong>
              {availableRooms.length === 0 ? (
                <p className="spico-muted">No available room of this type for these dates.</p>
              ) : (
                <form action={checkInReservationAction} className="mt--10">
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="hotelSlug" value={hotelSlug} />
                  <input type="hidden" name="reservationId" value={r.id} />
                  <div className="spico-inline-form">
                    <select name="roomId" required aria-label="Room">
                      {availableRooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          Room {room.room_number}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rts-btn btn-primary">
                      Assign & check in
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {r.status === "checked_in" && (
            <div className="spico-panel">
              <strong>Check out</strong>
              <form action={checkOutReservationAction} className="mt--10">
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="hotelSlug" value={hotelSlug} />
                <input type="hidden" name="reservationId" value={r.id} />
                <button type="submit" className="rts-btn btn-primary">
                  Check out
                </button>
              </form>
            </div>
          )}

          {["pending", "confirmed"].includes(r.status) && (
            <div className="spico-panel">
              <strong>Other actions</strong>
              <div className="spico-inline-form" style={{ flexWrap: "wrap", marginTop: 8 }}>
                {r.status === "pending" && (
                  <StatusForm orgSlug={orgSlug} hotelSlug={hotelSlug} reservationId={r.id} next="confirmed" label="Confirm" variant="primary" />
                )}
                <StatusForm orgSlug={orgSlug} hotelSlug={hotelSlug} reservationId={r.id} next="no_show" label="Mark no-show" variant="danger" />
                <StatusForm orgSlug={orgSlug} hotelSlug={hotelSlug} reservationId={r.id} next="cancelled" label="Cancel" variant="danger" />
              </div>
            </div>
          )}
        </div>
      )}

      {canViewFolio && folio && (
        <>
          <h5 className="title mt--30" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            Folio <StatusChip status={folio.status} />
          </h5>
          <table className="spico-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((li) => (
                <tr key={li.id}>
                  <td>{li.service_date ?? "—"}</td>
                  <td>{folioLineCategoryLabel(li.category)}</td>
                  <td>{li.description}</td>
                  <td>{li.quantity}</td>
                  <td>{formatMoney(li.unit_amount, r.currency)}</td>
                  <td>{formatMoney(li.amount, r.currency)}</td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={6}>No charges yet.</td>
                </tr>
              )}
            </tbody>
          </table>

          <table className="spico-table">
            <thead>
              <tr>
                <th>Payment</th>
                <th>Method</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatMoney(p.amount, r.currency)}</td>
                  <td>{paymentMethodLabel(p.method)}</td>
                  <td>
                    <StatusChip status={p.status} variant={p.status === "refunded" ? "warning" : "success"} />
                  </td>
                  <td className="spico-muted">{new Date(p.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4}>No payments recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="spico-panel">
            <p>
              Charged: <strong>{formatMoney(balance.charged, r.currency)}</strong> · Paid:{" "}
              <strong>{formatMoney(balance.paid, r.currency)}</strong> · Balance due:{" "}
              <strong>{formatMoney(balance.balance, r.currency)}</strong>
            </p>
            <p className="spico-muted">
              Payments are recorded, not processed — no live payment gateway is connected (stub, see docs/roadmap.md).
            </p>
          </div>

          {canManageFolio && folio.status === "open" && (
            <div className="spico-two-col">
              <div className="spico-panel">
                <strong>Add a charge</strong>
                <form action={addFolioChargeAction} className="mt--10">
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="hotelSlug" value={hotelSlug} />
                  <input type="hidden" name="reservationId" value={r.id} />
                  <div className="spico-inline-form" style={{ flexWrap: "wrap" }}>
                    <select name="category" defaultValue="extra" aria-label="Category">
                      <option value="extra">Extra</option>
                      <option value="tax">Tax</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                    <input name="description" placeholder="Description" required maxLength={200} />
                    <input name="quantity" type="number" min={1} max={999} defaultValue={1} size={3} aria-label="Quantity" />
                    <input name="unitAmount" type="number" step="0.01" placeholder="Unit amount" required size={8} />
                    <button type="submit" className="rts-btn btn-primary">
                      Add
                    </button>
                  </div>
                </form>
              </div>

              <div className="spico-panel">
                <strong>Record a payment</strong>
                <form action={recordFolioPaymentAction} className="mt--10">
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="hotelSlug" value={hotelSlug} />
                  <input type="hidden" name="reservationId" value={r.id} />
                  <div className="spico-inline-form" style={{ flexWrap: "wrap" }}>
                    <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required size={8} />
                    <select name="method" defaultValue="card" aria-label="Method">
                      <option value="card">Card</option>
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="other">Other</option>
                    </select>
                    <input name="reference" placeholder="Reference (optional)" maxLength={200} />
                    <button type="submit" className="rts-btn btn-primary">
                      Record
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {canManageFolio && folio.status === "open" && (
            <form action={closeFolioAction} className="mt--10">
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <input type="hidden" name="reservationId" value={r.id} />
              <button type="submit" className="rts-btn btn-secondary">
                Close folio
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function StatusForm({
  orgSlug,
  hotelSlug,
  reservationId,
  next,
  label,
  variant,
}: {
  orgSlug: string;
  hotelSlug: string;
  reservationId: string;
  next: "confirmed" | "cancelled" | "no_show";
  label: string;
  variant: "primary" | "danger";
}) {
  return (
    <form action={setReservationStatusAction}>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="hotelSlug" value={hotelSlug} />
      <input type="hidden" name="reservationId" value={reservationId} />
      <input type="hidden" name="nextStatus" value={next} />
      <button type="submit" className={`rts-btn btn-${variant} btn-sm`}>
        {label}
      </button>
    </form>
  );
}

// Font Awesome class for a channel type. channelTypeIcon() returns the bare
// glyph name; WhatsApp/Viber are brand glyphs and need the fa-brands prefix.
function channelFaClass(channelType: string | undefined): string {
  if (!channelType) return "fa-solid fa-inbox";
  const icon = channelTypeIcon(channelType);
  const brand = icon === "fa-whatsapp" || icon === "fa-viber";
  return `${brand ? "fa-brands" : "fa-solid"} ${icon}`;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}
