"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { NEXT_STATUS, type HousekeepingTaskStatus } from "@/lib/housekeeping";
import { flash } from "@/lib/flash";

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
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("housekeeping.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: room } = await supabase.from("rooms").select("id").eq("id", p.roomId).eq("hotel_id", hotel.id).single();
  if (!room) {
    await flash("error", "Room does not belong to this hotel");
    return;
  }

  if (p.assignedTo) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("id", p.assignedTo)
      .eq("organization_id", organization.id)
      .single();
    if (!membership) {
      await flash("error", "Assignee is not a member of this organization");
      return;
    }
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
    await flash("error", error?.message ?? "Failed to create task");
    return;
  }

  await flash("success", "Housekeeping task created");

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
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;
  const nextStatus = NEXT_STATUS[p.currentStatus as HousekeepingTaskStatus];
  if (!nextStatus) {
    await flash("error", "This task has no further status to advance to");
    return;
  }

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
    await flash("error", error?.message ?? "Failed to advance task (it may have already changed status)");
    return;
  }

  await flash("success", `Task marked ${nextStatus.replace("_", " ")}`);

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
