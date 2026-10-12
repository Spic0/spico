"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { generateApiKey, API_SCOPES, type ApiScope } from "@/lib/apiKeys";
import { flash } from "@/lib/flash";

export interface CreateApiKeyState {
  error?: string;
  created?: { name: string; plaintext: string };
}

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
});

const VALID_SCOPES = new Set(API_SCOPES.map((s) => s.scope));

export async function createApiKeyAction(_prevState: CreateApiKeyState, formData: FormData): Promise<CreateApiKeyState> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
  });
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Invalid input" };
  }
  const p = result.data;

  const scopes = formData.getAll("scopes").map(String).filter((s): s is ApiScope => VALID_SCOPES.has(s as ApiScope));
  if (scopes.length === 0) {
    return { error: "Select at least one scope" };
  }

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("api_keys.manage", { hotelId: hotel.id, organizationId: organization.id });

  const generated = generateApiKey();
  const supabase = await createClient();
  const { data: key, error } = await supabase
    .from("api_keys")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      name: p.name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !key) {
    return { error: error?.message ?? "Failed to create API key" };
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "api_key.created",
    targetType: "api_key",
    targetId: key.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, scopes, key_prefix: generated.prefix },
  });

  return { created: { name: p.name, plaintext: generated.plaintext } };
}

const revokeSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  apiKeyId: z.string().min(1),
});

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const result = revokeSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    apiKeyId: formData.get("apiKeyId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("api_keys.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").update({ status: "revoked" }).eq("id", p.apiKeyId).eq("hotel_id", hotel.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", "API key revoked");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "api_key.revoked",
    targetType: "api_key",
    targetId: p.apiKeyId,
    organizationId: organization.id,
    hotelId: hotel.id,
  });
}
