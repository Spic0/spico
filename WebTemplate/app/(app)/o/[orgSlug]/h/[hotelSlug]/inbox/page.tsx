import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { CONVERSATION_STATUSES, channelTypeLabel } from "@/lib/inboxChannels";
import { StatusChip } from "@/components/ui/StatusChip";
import { PageHeader } from "@/components/layout/PageHeader";

const FILTERS = [{ value: "all", label: "All" }, ...CONVERSATION_STATUSES];

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const { status: statusFilter = "open" } = await searchParams;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("inbox.view", { hotelId: hotel.id, organizationId: organization.id });
  const [canSend, canManageChannels] = await Promise.all([
    hasPermission(user.id, "inbox.send", { hotelId: hotel.id }),
    hasPermission(user.id, "channels.manage", { hotelId: hotel.id }),
  ]);

  const supabase = await createClient();
  let query = supabase
    .from("conversations")
    .select(
      "id, subject, guest_display_name, guest_identifier, status, priority, channel_id, assignee_membership_id, last_message_at, last_message_preview",
    )
    .eq("hotel_id", hotel.id)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }
  const { data: conversations, error } = await query;
  if (error) {
    throw new Error(`Failed to load conversations: ${error.message}`);
  }

  const rows = conversations ?? [];
  const channelIds = Array.from(new Set(rows.map((c) => c.channel_id)));
  const assigneeIds = Array.from(
    new Set(rows.map((c) => c.assignee_membership_id).filter((id): id is string => id !== null)),
  );

  const [{ data: channels }, { data: memberships }] = await Promise.all([
    channelIds.length
      ? supabase.from("channels").select("id, name, channel_type").in("id", channelIds)
      : Promise.resolve({ data: [] as { id: string; name: string; channel_type: string }[] }),
    assigneeIds.length
      ? supabase.from("memberships").select("id, profile_id").in("id", assigneeIds)
      : Promise.resolve({ data: [] as { id: string; profile_id: string }[] }),
  ]);
  const profileIds = Array.from(new Set((memberships ?? []).map((m) => m.profile_id)));
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", profileIds)
    : { data: [] as { id: string; email: string; full_name: string | null }[] };

  const channelById = new Map((channels ?? []).map((c) => [c.id, c]));
  const profileByMembership = new Map(
    (memberships ?? []).map((m) => [m.id, (profiles ?? []).find((p) => p.id === m.profile_id)]),
  );
  const assigneeName = (membershipId: string | null) => {
    if (!membershipId) return "Unassigned";
    const p = profileByMembership.get(membershipId);
    return p?.full_name || p?.email || "Unknown";
  };

  const base = `/o/${orgSlug}/h/${hotelSlug}/inbox`;

  return (
    <div className="pt--40">
      <PageHeader
        title="Inbox"
        subtitle={`${hotel.name} · ${organization.name}`}
        actions={
          <>
            {canManageChannels && (
              <Link href={`${base}/channels`} className="rts-btn btn-border">
                Channels
              </Link>
            )}
            {canSend && (
              <Link href={`${base}/new`} className="rts-btn btn-primary">
                New conversation
              </Link>
            )}
          </>
        }
      />

      <p className="spico-muted">
        Skeleton inbox — messages are stored but not transmitted to any live provider yet.
      </p>

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
            <th>Guest</th>
            <th>Channel</th>
            <th>Last message</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const channel = channelById.get(c.channel_id);
            return (
              <tr key={c.id}>
                <td>
                  <Link href={`${base}/${c.id}`}>
                    {c.guest_display_name || c.guest_identifier || "Guest"}
                  </Link>
                  {c.subject && <div className="spico-muted">{c.subject}</div>}
                </td>
                <td>{channel ? `${channel.name} · ${channelTypeLabel(channel.channel_type)}` : "—"}</td>
                <td className="spico-muted">{c.last_message_preview ?? ""}</td>
                <td>
                  <StatusChip status={c.status} />
                </td>
                <td>
                  <StatusChip
                    status={c.priority}
                    variant={c.priority === "high" ? "danger" : c.priority === "low" ? "info" : "neutral"}
                  />
                </td>
                <td>{assigneeName(c.assignee_membership_id)}</td>
                <td className="spico-muted">
                  {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : "—"}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7}>No conversations{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""} yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
