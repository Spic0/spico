import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { channelTypeLabel, CONVERSATION_STATUSES, CONVERSATION_PRIORITIES } from "@/lib/inboxChannels";
import { StatusChip } from "@/components/ui/StatusChip";
import { sendReplyAction, setConversationStatusAction, assignConversationAction } from "../actions";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; conversationId: string }>;
}) {
  const { orgSlug, hotelSlug, conversationId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("inbox.view", { hotelId: hotel.id, organizationId: organization.id });
  const [canSend, canManage] = await Promise.all([
    hasPermission(user.id, "inbox.send", { hotelId: hotel.id }),
    hasPermission(user.id, "inbox.manage", { hotelId: hotel.id }),
  ]);

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, subject, guest_display_name, guest_identifier, status, priority, channel_id, assignee_membership_id, assigned_department_id",
    )
    .eq("id", conversationId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!conversation) {
    notFound();
  }

  const [{ data: channel }, { data: messages }, { data: memberships }, { data: departments }] = await Promise.all([
    supabase.from("channels").select("name, channel_type").eq("id", conversation.channel_id).single(),
    supabase
      .from("messages")
      .select("id, direction, sender_type, sender_membership_id, body, delivery_status, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("memberships")
      .select("id, profile_id, hotel_id")
      .eq("organization_id", organization.id)
      .eq("status", "active"),
    supabase.from("departments").select("id, name").eq("hotel_id", hotel.id).eq("status", "active").order("name"),
  ]);

  const relevantMemberships = (memberships ?? []).filter((m) => m.hotel_id === hotel.id || m.hotel_id === null);
  const profileIds = Array.from(new Set(relevantMemberships.map((m) => m.profile_id)));
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", profileIds)
    : { data: [] as { id: string; email: string; full_name: string | null }[] };
  const nameByMembership = new Map(
    relevantMemberships.map((m) => {
      const p = (profiles ?? []).find((x) => x.id === m.profile_id);
      return [m.id, p?.full_name || p?.email || "Member"];
    }),
  );

  const senderLabel = (m: { sender_type: string; sender_membership_id: string | null }) => {
    if (m.sender_type === "user") return m.sender_membership_id ? nameByMembership.get(m.sender_membership_id) ?? "Staff" : "Staff";
    if (m.sender_type === "ai") return "AI agent";
    if (m.sender_type === "guest") return conversation.guest_display_name || "Guest";
    return "System";
  };

  const base = `/o/${orgSlug}/h/${hotelSlug}/inbox`;

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to inbox
      </Link>
      <div className="spico-inline-form" style={{ justifyContent: "space-between", marginTop: 10 }}>
        <h4 className="title" style={{ margin: 0 }}>
          {conversation.guest_display_name || conversation.guest_identifier || "Guest"}
        </h4>
        <StatusChip status={conversation.status} />
      </div>
      <p className="spico-muted">
        {channel ? `${channel.name} · ${channelTypeLabel(channel.channel_type)}` : "Channel removed"}
        {conversation.subject ? ` · ${conversation.subject}` : ""}
        {conversation.guest_identifier ? ` · ${conversation.guest_identifier}` : ""}
      </p>

      <div className="spico-thread">
        {(messages ?? []).map((m) => (
          <div key={m.id} className={`spico-msg spico-msg-${m.direction === "outbound" ? "out" : "in"}`}>
            <div className="spico-msg-meta">
              {senderLabel(m)} · {new Date(m.created_at).toLocaleString()}
              {m.direction === "outbound" && ` · ${m.delivery_status}`}
            </div>
            <div className="spico-msg-body">{m.body}</div>
          </div>
        ))}
        {(messages ?? []).length === 0 && <p className="spico-muted">No messages yet.</p>}
      </div>

      {canSend && (
        <form action={sendReplyAction} className="spico-panel">
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="hotelSlug" value={hotelSlug} />
          <input type="hidden" name="conversationId" value={conversation.id} />
          <div className="input-wrapper">
            <label className="visually-hidden" htmlFor="reply-body">
              Reply
            </label>
            <textarea id="reply-body" name="body" rows={3} placeholder="Write a reply…" required maxLength={8000} />
          </div>
          <button type="submit" className="rts-btn btn-primary">
            Send reply
          </button>
          <span className="spico-muted" style={{ marginLeft: 10 }}>
            Stored only — not transmitted (no live provider yet).
          </span>
        </form>
      )}

      {canManage && (
        <div className="spico-two-col">
          <div className="spico-panel">
            <strong>Status</strong>
            <div className="spico-inline-form" style={{ flexWrap: "wrap", marginTop: 8 }}>
              {CONVERSATION_STATUSES.filter((s) => s.value !== conversation.status).map((s) => (
                <form key={s.value} action={setConversationStatusAction}>
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="hotelSlug" value={hotelSlug} />
                  <input type="hidden" name="conversationId" value={conversation.id} />
                  <input type="hidden" name="status" value={s.value} />
                  <button type="submit" className="rts-btn btn-border">
                    {s.label}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="spico-panel">
            <strong>Assignment</strong>
            <form action={assignConversationAction} className="mt--10">
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <input type="hidden" name="conversationId" value={conversation.id} />
              <div className="input-wrapper">
                <label htmlFor="assignee">Assignee</label>
                <select id="assignee" name="assigneeMembershipId" defaultValue={conversation.assignee_membership_id ?? ""}>
                  <option value="">Unassigned</option>
                  {relevantMemberships.map((m) => (
                    <option key={m.id} value={m.id}>
                      {nameByMembership.get(m.id)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-wrapper">
                <label htmlFor="dept">Department</label>
                <select id="dept" name="assignedDepartmentId" defaultValue={conversation.assigned_department_id ?? ""}>
                  <option value="">None</option>
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-wrapper">
                <label htmlFor="priority">Priority</label>
                <select id="priority" name="priority" defaultValue={conversation.priority}>
                  {CONVERSATION_PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="rts-btn btn-primary">
                Save assignment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
