"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { testConnectorConnection, type IntegrationType } from "@/lib/integrations";

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  integrationType: z.enum(["pms", "crm", "calendar", "channel_manager"]),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
});

export async function createConnectorAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    integrationType: formData.get("integrationType"),
    name: formData.get("name"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("integrations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: connector, error } = await supabase
    .from("integrations")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      integration_type: p.integrationType,
      name: p.name,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !connector) {
    throw new Error(error?.message ?? "Failed to create connector (a connector with this name may already exist)");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "integration.created",
    targetType: "integration",
    targetId: connector.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, integration_type: p.integrationType },
  });
}

const testSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  connectorId: z.string().min(1),
  integrationType: z.enum(["pms", "crm", "calendar", "channel_manager"]),
});

export async function testConnectorAction(formData: FormData): Promise<void> {
  const result = testSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    connectorId: formData.get("connectorId"),
    integrationType: formData.get("integrationType"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("integrations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const testResult = await testConnectorConnection(p.integrationType as IntegrationType);

  const supabase = await createClient();
  const { error } = await supabase
    .from("integrations")
    .update({ status: testResult.ok ? "configured" : "not_connected" })
    .eq("id", p.connectorId)
    .eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "integration.test_connection",
    targetType: "integration",
    targetId: p.connectorId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { ok: testResult.ok, note: testResult.note },
  });
}

const deleteSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  connectorId: z.string().min(1),
});

export async function deleteConnectorAction(formData: FormData): Promise<void> {
  const result = deleteSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    connectorId: formData.get("connectorId"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("integrations.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { error } = await supabase.from("integrations").delete().eq("id", p.connectorId).eq("hotel_id", hotel.id);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "integration.deleted",
    targetType: "integration",
    targetId: p.connectorId,
    organizationId: organization.id,
    hotelId: hotel.id,
  });
}
