import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { channelTypeLabel } from "@/lib/inboxChannels";
import { createConversationAction } from "../actions";

export default async function NewConversationPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("inbox.send", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: channels } = await supabase
    .from("channels")
    .select("id, name, channel_type")
    .eq("hotel_id", hotel.id)
    .eq("status", "active")
    .order("name");

  const base = `/o/${orgSlug}/h/${hotelSlug}/inbox`;
  const activeChannels = channels ?? [];

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to inbox
      </Link>
      <h4 className="title mt--10">New conversation</h4>

      {activeChannels.length === 0 ? (
        <p className="spico-muted">
          No active channels. Add one under <Link href={`${base}/channels`}>Channels</Link> first.
        </p>
      ) : (
        <form action={createConversationAction} className="spico-panel spico-settings-form">
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="hotelSlug" value={hotelSlug} />
          <div className="input-wrapper">
            <label htmlFor="channelId">Channel</label>
            <select id="channelId" name="channelId" required>
              {activeChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {channelTypeLabel(c.channel_type)}
                </option>
              ))}
            </select>
          </div>
          <div className="input-wrapper">
            <label htmlFor="guestDisplayName">Guest name</label>
            <input id="guestDisplayName" name="guestDisplayName" type="text" maxLength={160} placeholder="Optional" />
          </div>
          <div className="input-wrapper">
            <label htmlFor="guestIdentifier">Guest contact (email / phone)</label>
            <input id="guestIdentifier" name="guestIdentifier" type="text" maxLength={200} placeholder="Optional" />
          </div>
          <div className="input-wrapper">
            <label htmlFor="subject">Subject</label>
            <input id="subject" name="subject" type="text" maxLength={200} placeholder="Optional" />
          </div>
          <div className="input-wrapper">
            <label htmlFor="body">First message</label>
            <textarea id="body" name="body" rows={4} required maxLength={8000} placeholder="Write the first message…" />
          </div>
          <button type="submit" className="rts-btn btn-primary">
            Start conversation
          </button>
        </form>
      )}
    </div>
  );
}
