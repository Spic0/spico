"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { NEXT_STATUS, type HousekeepingTaskStatus } from "@/lib/housekeeping";

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  roomId: z.string().min(1, "Choose a room"),
  taskType: z.enum(["checkout_clean", "stayover_clean", "inspection", "maintenance"]),
  priority: z.enum(["low", "normal", "high"]),
  assignedTo: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export async function createHousekeepingTaskAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    roomId: formData.get("roomId"),
    taskType: formData.get("taskType"),
    priority: formData.get("priority"),
    assignedTo: (formData.get("assignedTo") as string | null) || undefined,
    notes: (formData.get("notes") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("housekeeping.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("id").eq("id", p.roomId).eq("hotel_id", hotel.id).single();
  if (!room) throw new Error("Room does not belong to this hotel");

  if (p.assignedTo) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("id", p.assignedTo)
      .eq("organization_id", organization.id)
      .single();
    if (!membership) throw new Error("Assignee is not a member of this organization");
  }

  const { data: task, error } = await supabase
    .from("housekeeping_tasks")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      room_id: p.roomId,
      task_type: p.taskType,
      priority: p.priority,
      assigned_to: p.assignedTo || null,
      notes: p.notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !task) {
    throw new Error(error?.message ?? "Failed to create task");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "housekeeping_task.created",
    targetType: "housekeeping_task",
    targetId: task.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { room_id: p.roomId, task_type: p.taskType },
  });
}

const advanceSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  taskId: z.string().min(1),
  currentStatus: z.enum(["pending", "in_progress", "completed", "verified"]),
});

export async function advanceHousekeepingTaskAction(formData: FormData): Promise<void> {
  const result = advanceSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    taskId: formData.get("taskId"),
    currentStatus: formData.get("currentStatus"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;
  const nextStatus = NEXT_STATUS[p.currentStatus as HousekeepingTaskStatus];
  if (!nextStatus) throw new Error("This task has no further status to advance to");

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("housekeeping.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("housekeeping_tasks")
    .update({
      status: nextStatus,
      started_at: nextStatus === "in_progress" ? now : undefined,
      completed_at: nextStatus === "completed" ? now : undefined,
      verified_at: nextStatus === "verified" ? now : undefined,
      verified_by: nextStatus === "verified" ? user.id : undefined,
    })
    .eq("id", p.taskId)
    .eq("hotel_id", hotel.id)
    .eq("status", p.currentStatus)
    .select("id, room_id")
    .single();
  if (error || !updated) {
    throw new Error(error?.message ?? "Failed to advance task (it may have already changed status)");
  }

  // A verified checkout_clean task means the room is ready — clear the
  // dirty flag so front desk sees it as clean again.
  if (nextStatus === "verified") {
    await supabase.from("rooms").update({ housekeeping_status: "clean" }).eq("id", updated.room_id).eq("hotel_id", hotel.id);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "housekeeping_task.advanced",
    targetType: "housekeeping_task",
    targetId: p.taskId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { status: nextStatus },
  });
}
