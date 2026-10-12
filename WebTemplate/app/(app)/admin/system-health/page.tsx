import { requirePlatformRole } from "@/lib/authz";
import { PageHeader } from "@/components/layout/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Status vocabulary is fixed and must never expose secrets/raw env values —
// only booleans/counts/timestamps. "Configured" means the relevant env vars
// are present, never that a live connection was verified; "Reachable" means
// a real round-trip succeeded just now. Voice deliberately stays DB-derived
// only (no HTTP call to voice-service) — that cross-service coupling was
// explicitly avoided in M8 and this page preserves that boundary; see
// docs/assumptions.md M12.
type Status = "Configured" | "Not configured" | "Reachable" | "Unreachable" | "Not tested" | "Stub mode";

function StatusBadge({ status }: { status: Status }) {
  const variant =
    status === "Configured" || status === "Reachable"
      ? "success"
      : status === "Unreachable"
        ? "danger"
        : status === "Stub mode"
          ? "warning"
          : "neutral";
  return <span className={`spico-chip is-${variant}`}>{status}</span>;
}

export default async function SystemHealthPage() {
  await requirePlatformRole(["admin", "superadmin"]);
  const supabase = await createClient();

  let dbStatus: Status = "Not tested";
  try {
    const { error } = await supabase.from("plans").select("id", { count: "exact", head: true });
    dbStatus = error ? "Unreachable" : "Reachable";
  } catch {
    dbStatus = "Unreachable";
  }

  let storageStatus: Status = "Not tested";
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (!error) {
      storageStatus = (buckets ?? []).some((b) => b.name === "kb-documents") ? "Reachable" : "Not configured";
    }
  } catch {
    storageStatus = "Not tested";
  }

  const upstashConfigured = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

  const [{ count: activeApiKeys }, { count: activeWebhooks }, { count: voiceEnabledHotels }, { data: lastCall }] =
    await Promise.all([
      supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("webhooks").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("hotel_voice_settings").select("id", { count: "exact", head: true }).eq("enabled", true),
      supabase.from("calls").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const { data: hotels } = await supabase
    .from("hotels")
    .select("id, name, slug, status, organization_id")
    .order("name");
  const hotelIds = (hotels ?? []).map((h) => h.id);
  const { data: bookingSettings } = hotelIds.length
    ? await supabase.from("booking_settings").select("hotel_id, enabled").in("hotel_id", hotelIds)
    : { data: [] };
  const bookingEnabledByHotel = new Map((bookingSettings ?? []).map((b) => [b.hotel_id, b.enabled]));

  const { data: orgs } = await supabase.from("organizations").select("id, slug");
  const orgSlugById = new Map((orgs ?? []).map((o) => [o.id, o.slug]));

  return (
    <div className="pt--40">
      <PageHeader title="System Health" subtitle="Platform administration" />
      <p className="spico-muted">
        Truthful status only — never claims a provider is connected unless verified just now, and never renders a
        secret, connection string, or key value.
      </p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Supabase configuration</td>
            <td><StatusBadge status={env.NEXT_PUBLIC_SUPABASE_URL ? "Configured" : "Not configured"} /></td>
          </tr>
          <tr>
            <td>Database connectivity</td>
            <td><StatusBadge status={dbStatus} /></td>
          </tr>
          <tr>
            <td>Storage bucket (kb-documents)</td>
            <td><StatusBadge status={storageStatus} /></td>
          </tr>
          <tr>
            <td>Voice (Telnyx/OpenAI Realtime)</td>
            <td>
              <StatusBadge status="Stub mode" /> — {voiceEnabledHotels ?? 0} hotel(s) with voice enabled ·{" "}
              {lastCall?.created_at ? `last call ${new Date(lastCall.created_at).toLocaleString()}` : "no calls yet"}
            </td>
          </tr>
          <tr>
            <td>Upstash rate limiting / idempotency</td>
            <td><StatusBadge status={upstashConfigured ? "Configured" : "Not configured"} /></td>
          </tr>
          <tr>
            <td>Open API (api keys)</td>
            <td><StatusBadge status={(activeApiKeys ?? 0) > 0 ? "Configured" : "Not configured"} /> — {activeApiKeys ?? 0} active key(s)</td>
          </tr>
          <tr>
            <td>Webhooks</td>
            <td><StatusBadge status={(activeWebhooks ?? 0) > 0 ? "Configured" : "Not configured"} /> — {activeWebhooks ?? 0} active webhook(s)</td>
          </tr>
          <tr>
            <td>PMS/CRM/channel-manager connectors</td>
            <td><StatusBadge status="Stub mode" /> — no live vendor connection exists in this milestone</td>
          </tr>
          <tr>
            <td>Test-data seeding</td>
            <td><StatusBadge status={env.ENABLE_DEMO_DATA_SEEDING ? "Configured" : "Not configured"} /></td>
          </tr>
        </tbody>
      </table>

      <h5 className="title mt--30">Hotel activation &amp; booking-engine readiness</h5>
      <table className="spico-table">
        <thead>
          <tr>
            <th>Hotel</th>
            <th>Activation status</th>
            <th>Booking engine</th>
          </tr>
        </thead>
        <tbody>
          {(hotels ?? []).map((hotel) => {
            const orgSlug = orgSlugById.get(hotel.organization_id);
            const bookingEnabled = bookingEnabledByHotel.get(hotel.id);
            return (
              <tr key={hotel.id}>
                <td>
                  {orgSlug ? <a href={`/o/${orgSlug}/h/${hotel.slug}`}>{hotel.name}</a> : hotel.name}
                </td>
                <td style={{ textTransform: "capitalize" }}>{hotel.status}</td>
                <td>{bookingEnabled === true ? "Configured" : bookingEnabled === false ? "Not configured" : "Not configured"}</td>
              </tr>
            );
          })}
          {(hotels ?? []).length === 0 && (
            <tr>
              <td colSpan={3}>No hotels yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
