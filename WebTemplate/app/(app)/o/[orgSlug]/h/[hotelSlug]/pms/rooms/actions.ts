"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

async function assertRoomTypeInHotel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomTypeId: string,
  hotelId: string,
): Promise<void> {
  const { data } = await supabase.from("room_types").select("id").eq("id", roomTypeId).eq("hotel_id", hotelId).single();
  if (!data) throw new Error("Room type does not belong to this hotel");
}

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  roomTypeId: z.string().min(1, "Choose a room type"),
  roomNumber: z.string().min(1, "Room number is required").max(20),
  floor: z.string().max(20).optional(),
});

export async function createRoomAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    roomTypeId: formData.get("roomTypeId"),
    roomNumber: formData.get("roomNumber"),
    floor: (formData.get("floor") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  await assertRoomTypeInHotel(supabase, p.roomTypeId, hotel.id);

  const { data: room, error } = await supabase
    .from("rooms")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      room_type_id: p.roomTypeId,
      room_number: p.roomNumber,
      floor: p.floor || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !room) {
    throw new Error(error?.message ?? "Failed to create room (number may already exist)");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "room.created",
    targetType: "room",
    targetId: room.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { room_number: p.roomNumber },
  });
}

const updateSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  roomId: z.string().min(1),
  roomTypeId: z.string().min(1),
  roomNumber: z.string().min(1).max(20),
  floor: z.string().max(20).optional(),
  housekeepingStatus: z.enum(["clean", "dirty", "inspected", "out_of_service"]),
  status: z.enum(["active", "inactive"]),
});

export async function updateRoomAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    roomId: formData.get("roomId"),
    roomTypeId: formData.get("roomTypeId"),
    roomNumber: formData.get("roomNumber"),
    floor: (formData.get("floor") as string | null)?.trim() || undefined,
    housekeepingStatus: formData.get("housekeepingStatus"),
    status: formData.get("status"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("pms.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  await assertRoomTypeInHotel(supabase, p.roomTypeId, hotel.id);

  const { data: updated, error } = await supabase
    .from("rooms")
    .update({
      room_type_id: p.roomTypeId,
      room_number: p.roomNumber,
      floor: p.floor || null,
      housekeeping_status: p.housekeepingStatus,
      status: p.status,
    })
    .eq("id", p.roomId)
    .eq("hotel_id", hotel.id)
    .select("id")
    .single();

  if (error || !updated) {
    throw new Error(error?.message ?? "Failed to update room");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "room.updated",
    targetType: "room",
    targetId: p.roomId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { room_number: p.roomNumber, housekeeping_status: p.housekeepingStatus, status: p.status },
  });
}
