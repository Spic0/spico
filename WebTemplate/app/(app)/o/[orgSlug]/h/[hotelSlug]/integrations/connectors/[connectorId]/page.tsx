import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { SYNC_DIRECTIONS, syncDirectionLabel } from "@/lib/channelSync";
import { StatusChip } from "@/components/ui/StatusChip";
import { runChannelSyncAction } from "./actions";

export default async function ConnectorDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; connectorId: string }>;
}) {
  const { orgSlug, hotelSlug, connectorId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("integrations.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "integrations.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: connector } = await supabase
    .from("integrations")
    .select("id, name, integration_type, status")
    .eq("id", connectorId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!connector || connector.integration_type !== "channel_manager") notFound();

  const { data: logs, error } = await supabase
    .from("channel_manager_sync_logs")
    .select("id, direction, status, summary, started_at, completed_at")
    .eq("integration_id", connector.id)
    .order("started_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Failed to load sync logs: ${error.message}`);

  const base = `/o/${orgSlug}/h/${hotelSlug}/integrations/connectors`;

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to connectors
      </Link>
      <h4 className="title mt--10">{connector.name} — Sync</h4>
      <p className="spico-muted">
        &quot;Sync now&quot; assembles this hotel&apos;s real current rates/availability/reservations and logs what
        WOULD be sent — nothing is ever transmitted to a live channel manager (no OTA connection exists). See
        docs/roadmap.md (M11).
      </p>

      {canManage && (
        <div className="spico-inline-form" style={{ flexWrap: "wrap" }}>
          {SYNC_DIRECTIONS.map((d) => (
            <form action={runChannelSyncAction} key={d.value}>
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="hotelSlug" value={hotelSlug} />
              <input type="hidden" name="connectorId" value={connector.id} />
              <input type="hidden" name="direction" value={d.value} />
              <button type="submit" className="rts-btn btn-primary" title={d.description}>
                {d.label}
              </button>
            </form>
          ))}
        </div>
      )}

      <h5 className="title mt--30">Sync history</h5>
      <table className="spico-table">
        <thead>
          <tr>
            <th>Direction</th>
            <th>Status</th>
            <th>Summary</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {(logs ?? []).map((log) => (
            <tr key={log.id}>
              <td>{syncDirectionLabel(log.direction)}</td>
              <td>
                <StatusChip status={log.status} />
              </td>
              <td>
                <details>
                  <summary className="spico-muted">View data</summary>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(log.summary, null, 2)}</pre>
                </details>
              </td>
              <td className="spico-muted">{new Date(log.started_at).toLocaleString()}</td>
            </tr>
          ))}
          {(logs ?? []).length === 0 && (
            <tr>
              <td colSpan={4}>No syncs yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
