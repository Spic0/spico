import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { callStatusLabel, callDispositionLabel, callEventLabel, formatCallDuration } from "@/lib/voice";
import { addCallNoteAction, markHandoffCompletedAction } from "../actions";

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; callId: string }>;
}) {
  const { orgSlug, hotelSlug, callId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("calls.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "calls.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: call } = await supabase
    .from("calls")
    .select(
      "id, direction, from_number, to_number, provider, status, disposition, handoff_reason, notes, ai_agent_id, started_at, answered_at, ended_at, duration_seconds",
    )
    .eq("id", callId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!call) notFound();

  const [{ data: agent }, { data: events }] = await Promise.all([
    call.ai_agent_id ? supabase.from("ai_agents").select("name").eq("id", call.ai_agent_id).single() : Promise.resolve({ data: null }),
    supabase.from("call_events").select("id, event_type, payload, created_at").eq("call_id", call.id).order("created_at"),
  ]);

  const base = `/o/${orgSlug}/h/${hotelSlug}/calls`;

  return (
    <div className="mt--20">
      <Link href={base} className="spico-muted">
        ← Back to call history
      </Link>

      <div className="spico-panel mt--10">
        <p>
          <strong>{call.direction}</strong> call · {call.from_number ?? "unknown"} → {call.to_number ?? "unknown"}
        </p>
        <p className="spico-muted">
          Provider: {call.provider} (stub) · Agent: {agent?.name ?? "none"} · Status: {callStatusLabel(call.status)} ·
          Disposition: {callDispositionLabel(call.disposition)}
        </p>
        <p className="spico-muted">
          Started {new Date(call.started_at).toLocaleString()} · Duration {formatCallDuration(call.duration_seconds)}
        </p>
        {call.handoff_reason && <p>Handoff reason: {call.handoff_reason}</p>}
        {call.notes && (
          <p style={{ whiteSpace: "pre-wrap" }}>
            <strong>Notes:</strong>
            <br />
            {call.notes}
          </p>
        )}
      </div>

      <h5 className="title mt--30">Events</h5>
      <ul className="spico-plain-list">
        {(events ?? []).map((e) => {
          const payload = e.payload as Record<string, unknown> | null;
          const hasPayload = !!payload && Object.keys(payload).length > 0;
          return (
            <li key={e.id}>
              <strong>{callEventLabel(e.event_type)}</strong>{" "}
              <span className="spico-muted">{new Date(e.created_at).toLocaleString()}</span>
              {hasPayload && <div className="spico-muted">{JSON.stringify(payload)}</div>}
            </li>
          );
        })}
        {(events ?? []).length === 0 && <li className="spico-muted">No events recorded.</li>}
      </ul>

      {canManage && (
        <div className="spico-two-col">
          {call.disposition === "handoff_required" && (
            <div className="spico-panel">
              <strong>Handoff</strong>
              <p className="spico-muted">This call was flagged as needing a human handoff.</p>
              <form action={markHandoffCompletedAction}>
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <input type="hidden" name="hotelSlug" value={hotelSlug} />
                <input type="hidden" name="callId" value={call.id} />
                <button type="submit" className="rts-btn btn-primary">
                  Mark handoff completed
                </button>
              </form>
            </div>
          )}

          <div className="spico-panel">
            <strong>Add a note</strong>
            <form action={addCallNoteAction} className="mt--10">
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <input type="hidden" name="callId" value={call.id} />
              <textarea name="note" rows={3} maxLength={2000} required placeholder="Internal note about this call" />
              <button type="submit" className="rts-btn btn-primary mt--10">
                Save note
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
