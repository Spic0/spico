import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { CHANNEL_TYPES, channelTypeLabel } from "@/lib/inboxChannels";
import { StatusChip } from "@/components/ui/StatusChip";
import { createChannelAction, updateChannelAction, setChannelStatusAction } from "./actions";

const DIRECTIONS = [
  { value: "bidirectional", label: "Two-way" },
  { value: "inbound", label: "Inbound only" },
  { value: "outbound", label: "Outbound only" },
];

export default async function ChannelsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  // channels.manage is required for this whole screen (view + edit).
  await requirePermission("channels.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: channels, error } = await supabase
    .from("channels")
    .select("id, name, channel_type, identifier, direction, status")
    .eq("hotel_id", hotel.id)
    .order("name");
  if (error) {
    throw new Error(`Failed to load channels: ${error.message}`);
  }

  const base = `/o/${orgSlug}/h/${hotelSlug}/inbox`;

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to inbox
      </Link>
      <PageHeader title="Channels" subtitle={`${hotel.name} · Inbox`} />
      <p className="spico-muted">
        Every channel uses a stub provider — nothing is transmitted. Live provider connections arrive in a later
        milestone.
      </p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Identifier</th>
            <th>Direction</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {(channels ?? []).map((c) => (
            <tr key={c.id}>
              <td colSpan={4}>
                <form action={updateChannelAction} className="spico-inline-form">
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="hotelSlug" value={hotelSlug} />
                  <input type="hidden" name="channelId" value={c.id} />
                  <input name="name" type="text" defaultValue={c.name} required />
                  <span className="spico-muted">{channelTypeLabel(c.channel_type)}</span>
                  <input name="identifier" type="text" defaultValue={c.identifier ?? ""} placeholder="Identifier" />
                  <select name="direction" defaultValue={c.direction}>
                    {DIRECTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rts-btn btn-primary">
                    Save
                  </button>
                </form>
              </td>
              <td>
                <StatusChip status={c.status} />
              </td>
              <td>
                <form action={setChannelStatusAction}>
                  <input type="hidden" name="orgSlug" value={orgSlug} />
                  <input type="hidden" name="hotelSlug" value={hotelSlug} />
                  <input type="hidden" name="channelId" value={c.id} />
                  <input type="hidden" name="nextStatus" value={c.status === "active" ? "inactive" : "active"} />
                  <button type="submit" className="rts-btn btn-border">
                    {c.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {(channels ?? []).length === 0 && (
            <tr>
              <td colSpan={6}>No channels yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h5 className="title mt--30">Add a channel</h5>
      <form action={createChannelAction} className="spico-panel spico-settings-form">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <div className="input-wrapper">
          <label htmlFor="ch-name">Name</label>
          <input id="ch-name" name="name" type="text" placeholder="e.g. Front desk WhatsApp" required maxLength={120} />
        </div>
        <div className="input-wrapper">
          <label htmlFor="ch-type">Type</label>
          <select id="ch-type" name="channelType" defaultValue="email">
            {CHANNEL_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="input-wrapper">
          <label htmlFor="ch-identifier">Identifier (email address / phone number / widget id)</label>
          <input id="ch-identifier" name="identifier" type="text" placeholder="Optional" maxLength={200} />
        </div>
        <div className="input-wrapper">
          <label htmlFor="ch-direction">Direction</label>
          <select id="ch-direction" name="direction" defaultValue="bidirectional">
            {DIRECTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rts-btn btn-primary">
          Add channel
        </button>
      </form>
    </div>
  );
}
