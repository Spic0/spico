import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { CALL_DISPOSITIONS, formatCallDuration } from "@/lib/voice";
import { StatusChip } from "@/components/ui/StatusChip";

const FILTERS = [{ value: "all", label: "All" }, ...CALL_DISPOSITIONS];

export default async function CallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ disposition?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const { disposition: filter = "all" } = await searchParams;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("calls.read", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  let query = supabase
    .from("calls")
    .select("id, direction, from_number, to_number, status, disposition, ai_agent_id, started_at, duration_seconds")
    .eq("hotel_id", hotel.id)
    .order("started_at", { ascending: false })
    .limit(300);
  if (filter !== "all") query = query.eq("disposition", filter);
  const { data: calls, error } = await query;
  if (error) throw new Error(`Failed to load calls: ${error.message}`);

  const rows = calls ?? [];
  const agentIds = Array.from(new Set(rows.map((c) => c.ai_agent_id).filter((id): id is string => id !== null)));
  const { data: agents } = agentIds.length
    ? await supabase.from("ai_agents").select("id, name").in("id", agentIds)
    : { data: [] as { id: string; name: string }[] };
  const agentName = new Map((agents ?? []).map((a) => [a.id, a.name]));

  const base = `/o/${orgSlug}/h/${hotelSlug}/calls`;

  return (
    <div className="mt--20">
      <div className="spico-tab-nav">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`${base}?disposition=${f.value}`}
            className={`spico-tab-nav-item ${filter === f.value ? "active" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Direction</th>
            <th>From</th>
            <th>To</th>
            <th>Agent</th>
            <th>Status</th>
            <th>Disposition</th>
            <th>Duration</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`${base}/${c.id}`}>{c.direction}</Link>
              </td>
              <td>{c.from_number ?? "—"}</td>
              <td>{c.to_number ?? "—"}</td>
              <td>{c.ai_agent_id ? (agentName.get(c.ai_agent_id) ?? "—") : "—"}</td>
              <td>
                <StatusChip status={c.status} />
              </td>
              <td>{c.disposition ? <StatusChip status={c.disposition} /> : "—"}</td>
              <td>{formatCallDuration(c.duration_seconds)}</td>
              <td className="spico-muted">{new Date(c.started_at).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8}>
                No calls yet. Use the voice-service&apos;s simulate-call endpoint to generate a test call — see
                voice-service/README.md.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
