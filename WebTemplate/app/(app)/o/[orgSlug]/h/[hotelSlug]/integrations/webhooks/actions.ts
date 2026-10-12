"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { EVENT_TYPES, type WebhookEventType } from "@/lib/webhooks";
import { flash } from "@/lib/flash";

const VALID_EVENTS = new Set(EVENT_TYPES.map((e) => e.value));

function parseEventTypes(formData: FormData): WebhookEventType[] {
  return formData
    .getAll("eventTypes")
    .map(String)
    .filter((e): e is WebhookEventType => VALID_EVENTS.has(e as WebhookEventType));
}

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  url: z.string().url("Enter a valid URL").max(2000),
});

export async function createWebhookAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
    url: formData.get("url"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;
  const eventTypes = parseEventTypes(formData);
  if (eventTypes.length === 0) {
    await flash("error", "Select at least one event type");
    return;
  }

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("webhooks.manage", { hotelId: hotel.id, organizationId: organization.id });

  const secret = randomBytes(24).toString("base64url");
  const supabase = await createClient();
  const { data: webhook, error } = await supabase
    .from("webhooks")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      name: p.name,
      url: p.url,
      secret,
      event_types: eventTypes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !webhook) {
    await flash("error", error?.message ?? "Failed to create webhook");
    return;
  }

  await flash("success", `Webhook ${p.name} created`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "webhook.created",
    targetType: "webhook",
    targetId: webhook.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, url: p.url, event_types: eventTypes },
  });
}

const updateSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  webhookId: z.string().min(1),
  name: z.string().min(2).max(120),
  url: z.string().url("Enter a valid URL").max(2000),
});

export async function updateWebhookAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    webhookId: formData.get("webhookId"),
    name: formData.get("name"),
    url: formData.get("url"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;
  const eventTypes = parseEventTypes(formData);
  if (eventTypes.length === 0) {
    await flash("error", "Select at least one event type");
    return;
  }

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("webhooks.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { error } = await supabase
    .from("webhooks")
    .update({ name: p.name, url: p.url, event_types: eventTypes })
    .eq("id", p.webhookId)
    .eq("hotel_id", hotel.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", `Webhook ${p.name} saved`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "webhook.updated",
    targetType: "webhook",
    targetId: p.webhookId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: p.name, url: p.url, event_types: eventTypes },
  });
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  webhookId: z.string().min(1),
  nextStatus: z.enum(["active", "disabled"]),
});

export async function setWebhookStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    webhookId: formData.get("webhookId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("webhooks.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").update({ status: p.nextStatus }).eq("id", p.webhookId).eq("hotel_id", hotel.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", p.nextStatus === "active" ? "Webhook enabled" : "Webhook disabled");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "webhook.status_changed",
    targetType: "webhook",
    targetId: p.webhookId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: p.nextStatus },
  });
}

const deleteSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  webhookId: z.string().min(1),
});

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const result = deleteSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    webhookId: formData.get("webhookId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("webhooks.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").delete().eq("id", p.webhookId).eq("hotel_id", hotel.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", "Webhook removed");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "webhook.deleted",
    targetType: "webhook",
    targetId: p.webhookId,
    organizationId: organization.id,
    hotelId: hotel.id,
  });
}
