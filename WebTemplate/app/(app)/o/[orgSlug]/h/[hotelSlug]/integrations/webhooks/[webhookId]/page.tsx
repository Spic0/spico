import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPES, eventTypeLabel } from "@/lib/webhooks";
import { StatusChip } from "@/components/ui/StatusChip";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { updateWebhookAction, deleteWebhookAction } from "../actions";

export default async function WebhookDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; webhookId: string }>;
}) {
  const { orgSlug, hotelSlug, webhookId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("integrations.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "webhooks.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: webhook } = await supabase
    .from("webhooks")
    .select("id, name, url, secret, event_types, status")
    .eq("id", webhookId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!webhook) notFound();

  const { data: deliveries } = canManage
    ? await supabase
        .from("webhook_deliveries")
        .select("id, event_type, status, attempt_count, response_status, created_at")
        .eq("webhook_id", webhook.id)
        .order("created_at", { ascending: false })
        .limit(50)
    : { data: [] };

  const base = `/o/${orgSlug}/h/${hotelSlug}/integrations/webhooks`;
  const eventTypes = webhook.event_types as string[];

  return (
    <div className="mt--20">
      <Link href={base} className="spico-muted">
        ← Back to webhooks
      </Link>

      {canManage && (
        <>
          <h5 className="title mt--30">Signing secret</h5>
          <div className="spico-panel">
            <p className="spico-muted">
              Use this to verify the <code>X-Spico-Signature</code> header (HMAC-SHA256 of the raw request body).
            </p>
            <code className="spico-key-reveal">{webhook.secret}</code>
          </div>

          <h5 className="title mt--30">Edit</h5>
          <form action={updateWebhookAction} className="spico-panel spico-settings-form">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="webhookId" value={webhook.id} />
            <div className="input-wrapper">
              <label htmlFor="wh-name">Name</label>
              <input id="wh-name" name="name" type="text" defaultValue={webhook.name} required maxLength={120} />
            </div>
            <div className="input-wrapper">
              <label htmlFor="wh-url">URL</label>
              <input id="wh-url" name="url" type="url" defaultValue={webhook.url} required maxLength={2000} />
            </div>
            <div className="input-wrapper">
              <label>Event types</label>
              <div className="spico-checkbox-grid">
                {EVENT_TYPES.map((e) => (
                  <label key={e.value} className="form-check">
                    <input type="checkbox" name="eventTypes" value={e.value} defaultChecked={eventTypes.includes(e.value)} />
                    {e.label}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="rts-btn btn-primary">
              Save
            </button>
          </form>

          <form action={deleteWebhookAction} className="mt--10">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="webhookId" value={webhook.id} />
            <ConfirmSubmitButton
              confirmMessage="Delete this webhook endpoint? It will stop receiving events immediately. This cannot be undone."
              pendingLabel="Deleting…"
            >
              Delete webhook
            </ConfirmSubmitButton>
          </form>

          <h5 className="title mt--30">Recent deliveries</h5>
          <table className="spico-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Response</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {(deliveries ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{eventTypeLabel(d.event_type)}</td>
                  <td>
                    <StatusChip status={d.status} />
                  </td>
                  <td>{d.attempt_count}</td>
                  <td>{d.response_status ?? "—"}</td>
                  <td className="spico-muted">{new Date(d.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {(deliveries ?? []).length === 0 && (
                <tr>
                  <td colSpan={5}>No deliveries yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
