"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type CurrentUser } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { getChannelAdapter, type ChannelType } from "@/lib/inboxChannels";
import { flash } from "@/lib/flash";

// The acting user's membership in this hotel (hotel-scoped, else an org-wide
// membership). Used as the message sender; may be null for a platform admin
// with no membership.
function actingMembershipId(user: CurrentUser, organizationId: string, hotelId: string): string | null {
  const hotelScoped = user.memberships.find((m) => m.hotelId === hotelId);
  if (hotelScoped) return hotelScoped.id;
  const orgScoped = user.memberships.find((m) => m.hotelId === null && m.organizationId === organizationId);
  return orgScoped?.id ?? null;
}

function preview(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 140);
}

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  channelId: z.string().min(1, "Choose a channel"),
  guestDisplayName: z.string().max(160).optional(),
  guestIdentifier: z.string().max(200).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1, "Message is required").max(8000),
});

export async function createConversationAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    channelId: formData.get("channelId"),
    guestDisplayName: (formData.get("guestDisplayName") as string | null)?.trim() || undefined,
    guestIdentifier: (formData.get("guestIdentifier") as string | null)?.trim() || undefined,
    subject: (formData.get("subject") as string | null)?.trim() || undefined,
    body: formData.get("body"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("inbox.send", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("id, channel_type, status")
    .eq("id", parsed.channelId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!channel || channel.status !== "active") {
    await flash("error", "Choose an active channel that belongs to this hotel");
    return;
  }

  const { data: conversation, error } = await supabase
    .from("conversations")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      channel_id: channel.id,
      subject: parsed.subject ?? null,
      guest_display_name: parsed.guestDisplayName ?? null,
      guest_identifier: parsed.guestIdentifier ?? null,
      last_message_at: new Date().toISOString(),
      last_message_preview: preview(parsed.body),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !conversation) {
    await flash("error", error?.message ?? "Failed to create conversation");
    return;
  }

  // Stub adapter: records the outbound message, transmits nothing.
  const send = await getChannelAdapter(channel.channel_type as ChannelType).send({
    channelType: channel.channel_type as ChannelType,
    to: parsed.guestIdentifier ?? null,
    body: parsed.body,
  });

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    sender_type: "user",
    sender_membership_id: actingMembershipId(user, organization.id, hotel.id),
    body: parsed.body,
    delivery_status: send.deliveryStatus,
  });
  if (msgError) {
    await flash("error", msgError.message);
    return;
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "conversation.created",
    targetType: "conversation",
    targetId: conversation.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { channel_id: channel.id, guest_identifier: parsed.guestIdentifier ?? null },
  });

  await flash("success", "Message sent");
  redirect(`/o/${organization.slug}/h/${hotel.slug}/inbox/${conversation.id}`);
}

const replySchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  conversationId: z.string().min(1),
  body: z.string().min(1, "Message is required").max(8000),
});

export async function sendReplyAction(formData: FormData): Promise<void> {
  const result = replySchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("inbox.send", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, guest_identifier, status, channel_id")
    .eq("id", parsed.conversationId)
    .eq("hotel_id", hotel.id)
    .single();
  if (!conversation) {
    await flash("error", "Conversation not found");
    return;
  }

  const { data: channel } = await supabase
    .from("channels")
    .select("channel_type")
    .eq("id", conversation.channel_id)
    .single();
  const channelType = (channel?.channel_type ?? "web_chat") as ChannelType;
  const send = await getChannelAdapter(channelType).send({
    channelType: channelType as ChannelType,
    to: conversation.guest_identifier,
    body: parsed.body,
  });

  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    sender_type: "user",
    sender_membership_id: actingMembershipId(user, organization.id, hotel.id),
    body: parsed.body,
    delivery_status: send.deliveryStatus,
  });
  if (msgError) {
    await flash("error", msgError.message);
    return;
  }

  // Reopen a closed thread on reply, and refresh the preview.
  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview(parsed.body),
      status: conversation.status === "closed" ? "open" : conversation.status,
    })
    .eq("id", conversation.id);

  await flash("success", "Reply sent");
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  conversationId: z.string().min(1),
  status: z.enum(["open", "pending", "snoozed", "closed"]),
});

export async function setConversationStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    conversationId: formData.get("conversationId"),
    status: formData.get("status"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("inbox.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("conversations")
    .update({ status: parsed.status })
    .eq("id", parsed.conversationId)
    .eq("hotel_id", hotel.id)
    .select("id")
    .single();
  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to change status");
    return;
  }

  await flash("success", `Conversation ${parsed.status}`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "conversation.status_changed",
    targetType: "conversation",
    targetId: parsed.conversationId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: parsed.status },
  });
}

const assignSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  conversationId: z.string().min(1),
  assigneeMembershipId: z.string().optional(),
  assignedDepartmentId: z.string().optional(),
  priority: z.enum(["low", "normal", "high"]),
});

export async function assignConversationAction(formData: FormData): Promise<void> {
  const result = assignSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    conversationId: formData.get("conversationId"),
    assigneeMembershipId: (formData.get("assigneeMembershipId") as string | null) || undefined,
    assignedDepartmentId: (formData.get("assignedDepartmentId") as string | null) || undefined,
    priority: formData.get("priority"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("inbox.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();

  // A chosen assignee/department must belong to this hotel (cross-table check).
  if (parsed.assigneeMembershipId) {
    const { data } = await supabase
      .from("memberships")
      .select("id")
      .eq("id", parsed.assigneeMembershipId)
      .eq("organization_id", organization.id)
      .single();
    if (!data) {
      await flash("error", "Assignee is not a member of this organization");
      return;
    }
  }
  if (parsed.assignedDepartmentId) {
    const { data } = await supabase
      .from("departments")
      .select("id")
      .eq("id", parsed.assignedDepartmentId)
      .eq("hotel_id", hotel.id)
      .single();
    if (!data) {
      await flash("error", "Department does not belong to this hotel");
      return;
    }
  }

  const { data: updated, error } = await supabase
    .from("conversations")
    .update({
      assignee_membership_id: parsed.assigneeMembershipId ?? null,
      assigned_department_id: parsed.assignedDepartmentId ?? null,
      priority: parsed.priority,
    })
    .eq("id", parsed.conversationId)
    .eq("hotel_id", hotel.id)
    .select("id")
    .single();
  if (error || !updated) {
    await flash("error", error?.message ?? "Failed to update assignment");
    return;
  }

  await flash("success", "Assignment updated");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "conversation.assigned",
    targetType: "conversation",
    targetId: parsed.conversationId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: {
      assignee_membership_id: parsed.assigneeMembershipId ?? null,
      assigned_department_id: parsed.assignedDepartmentId ?? null,
      priority: parsed.priority,
    },
  });
}
