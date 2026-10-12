import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { apiScopeLabel } from "@/lib/apiKeys";
import { StatusChip } from "@/components/ui/StatusChip";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { ApiKeyCreateForm } from "./ApiKeyCreateForm";
import { revokeApiKeyAction } from "./actions";

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("integrations.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "api_keys.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, status, last_used_at, created_at")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load API keys: ${error.message}`);

  return (
    <div className="mt--20">
      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Key</th>
            <th>Scopes</th>
            <th>Status</th>
            <th>Last used</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(keys ?? []).map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td>
              <td>
                <code>{k.key_prefix}…</code>
              </td>
              <td>{(k.scopes as string[]).map(apiScopeLabel).join(", ")}</td>
              <td>
                <StatusChip status={k.status} />
              </td>
              <td className="spico-muted">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</td>
              {canManage && (
                <td>
                  {k.status === "active" && (
                    <form action={revokeApiKeyAction}>
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="hotelSlug" value={hotelSlug} />
                      <input type="hidden" name="apiKeyId" value={k.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Revoke API key "${k.name}"? Any integration using it will stop working immediately. This cannot be undone.`}
                        pendingLabel="Revoking…"
                      >
                        Revoke
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </td>
              )}
            </tr>
          ))}
          {(keys ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 6 : 5}>No API keys yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Create an API key</h5>
          <ApiKeyCreateForm orgSlug={orgSlug} hotelSlug={hotelSlug} />
        </>
      )}
    </div>
  );
}
