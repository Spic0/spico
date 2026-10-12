import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { INTEGRATION_TYPES, integrationTypeLabel } from "@/lib/integrations";
import { StatusChip } from "@/components/ui/StatusChip";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { createConnectorAction, testConnectorAction, deleteConnectorAction } from "./actions";

export default async function ConnectorsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const base = `/o/${orgSlug}/h/${hotelSlug}/integrations/connectors`;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("integrations.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "integrations.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: connectors, error } = await supabase
    .from("integrations")
    .select("id, integration_type, name, provider, status")
    .eq("hotel_id", hotel.id)
    .order("name");
  if (error) throw new Error(`Failed to load connectors: ${error.message}`);

  return (
    <div className="mt--20">
      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Provider</th>
            <th>Status</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(connectors ?? []).map((c) => (
            <tr key={c.id}>
              <td>
                {c.integration_type === "channel_manager" ? (
                  <Link href={`${base}/${c.id}`}>{c.name}</Link>
                ) : (
                  c.name
                )}
              </td>
              <td>{integrationTypeLabel(c.integration_type)}</td>
              <td className="spico-muted">{c.provider} (stub)</td>
              <td>
                <StatusChip status={c.status} />
              </td>
              {canManage && (
                <td>
                  <div className="spico-inline-form">
                    <form action={testConnectorAction}>
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="hotelSlug" value={hotelSlug} />
                      <input type="hidden" name="connectorId" value={c.id} />
                      <input type="hidden" name="integrationType" value={c.integration_type} />
                      <button type="submit" className="rts-btn btn-border">
                        Test connection
                      </button>
                    </form>
                    <form action={deleteConnectorAction}>
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="hotelSlug" value={hotelSlug} />
                      <input type="hidden" name="connectorId" value={c.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Remove the ${integrationTypeLabel(c.integration_type)} connector? Its stored configuration will be deleted.`}
                        pendingLabel="Removing…"
                      >
                        Remove
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </td>
              )}
            </tr>
          ))}
          {(connectors ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 5 : 4}>No connectors yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Add a connector</h5>
          <form action={createConnectorAction} className="spico-inline-form">
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <select name="integrationType" required aria-label="Type">
              {INTEGRATION_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
            <input name="name" placeholder="Name, e.g. Opera PMS" required maxLength={120} />
            <button type="submit" className="rts-btn btn-primary">
              Add connector
            </button>
          </form>
          <p className="spico-muted">
            &quot;Test connection&quot; always reports not connected — no live vendor integration exists yet.
          </p>
        </>
      )}
    </div>
  );
}
