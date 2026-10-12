import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { EVENT_TYPES, eventTypeLabel } from "@/lib/webhooks";
import { StatusChip } from "@/components/ui/StatusChip";
import { createWebhookAction, setWebhookStatusAction } from "./actions";

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("integrations.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "webhooks.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: webhooks, error } = await supabase
    .from("webhooks")
    .select("id, name, url, event_types, status")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load webhooks: ${error.message}`);

  const base = `/o/${orgSlug}/h/${hotelSlug}/integrations/webhooks`;

  return (
    <div className="mt--20">
      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>URL</th>
            <th>Events</th>
            <th>Status</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(webhooks ?? []).map((w) => (
            <tr key={w.id}>
              <td>
                <Link href={`${base}/${w.id}`}>{w.name}</Link>
              </td>
              <td className="spico-muted">{w.url}</td>
              <td>{(w.event_types as string[]).map(eventTypeLabel).join(", ")}</td>
              <td>
                <StatusChip status={w.status} variant={w.status === "active" ? "success" : "neutral"} />
              </td>
              {canManage && (
                <td>
                  <form action={setWebhookStatusAction}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="webhookId" value={w.id} />
                    <input type="hidden" name="nextStatus" value={w.status === "active" ? "disabled" : "active"} />
                    <button type="submit" className="rts-btn btn-secondary btn-sm">
                      {w.status === "active" ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {(webhooks ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 5 : 4}>No webhooks yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Add a webhook</h5>
          <form action={createWebhookAction} className="spico-panel spico-settings-form">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <div className="input-wrapper">
              <label htmlFor="wh-name">Name</label>
              <input id="wh-name" name="name" type="text" required maxLength={120} placeholder="e.g. Reservations to CRM" />
            </div>
            <div className="input-wrapper">
              <label htmlFor="wh-url">URL</label>
              <input id="wh-url" name="url" type="url" required maxLength={2000} placeholder="https://…" />
            </div>
            <div className="input-wrapper">
              <label>Event types</label>
              <div className="spico-checkbox-grid">
                {EVENT_TYPES.map((e) => (
                  <label key={e.value} className="form-check">
                    <input type="checkbox" name="eventTypes" value={e.value} />
                    {e.label}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="rts-btn btn-primary">
              Add webhook
            </button>
          </form>
        </>
      )}
    </div>
  );
}
