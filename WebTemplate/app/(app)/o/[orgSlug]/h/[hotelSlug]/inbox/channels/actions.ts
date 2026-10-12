"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const channelType = z.enum(["email", "sms", "whatsapp", "viber", "web_chat", "voice"]);
const direction = z.enum(["inbound", "outbound", "bidirectional"]);

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  channelType,
  identifier: z.string().max(200).optional(),
  direction,
});

export async function createChannelAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
    channelType: formData.get("channelType"),
    identifier: (formData.get("identifier") as string | null)?.trim() || undefined,
    direction: formData.get("direction"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("channels.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: channel, error } = await supabase
    .from("channels")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      channel_type: parsed.channelType,
      name: parsed.name,
      identifier: parsed.identifier ?? null,
      direction: parsed.direction,
      provider: "stub",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !channel) {
    await flash("error", error?.message ?? "Failed to create channel (a channel with this name may already exist)");
    return;
  }

  await flash("success", `Channel ${parsed.name} created`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "channel.created",
    targetType: "channel",
    targetId: channel.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: parsed.name, channel_type: parsed.channelType, direction: parsed.direction },
  });
}

const updateSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  channelId: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  identifier: z.string().max(200).optional(),
  direction,
});

export async function updateChannelAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    channelId: formData.get("channelId"),
    name: formData.get("name"),
    identifier: (formData.get("identifier") as string | null)?.trim() || undefined,
    direction: formData.get("direction"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("channels.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("channels")
    .update({ name: parsed.name, identifier: parsed.identifier ?? null, direction: parsed.direction })
    .eq("id", parsed.channelId)
    .eq("hotel_id", hotel.id)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to update channel");
    return;
  }

  await flash("success", `Channel ${parsed.name} saved`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "channel.updated",
    targetType: "channel",
    targetId: parsed.channelId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: parsed.name, direction: parsed.direction },
  });
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  channelId: z.string().min(1),
  nextStatus: z.enum(["active", "inactive"]),
});

export async function setChannelStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    channelId: formData.get("channelId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("channels.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("channels")
    .update({ status: parsed.nextStatus })
    .eq("id", parsed.channelId)
    .eq("hotel_id", hotel.id)
    .select("id")
    .single();

  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to change channel status");
    return;
  }

  await flash("success", parsed.nextStatus === "active" ? "Channel activated" : "Channel deactivated");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "channel.status_changed",
    targetType: "channel",
    targetId: parsed.channelId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: parsed.nextStatus },
  });
}
