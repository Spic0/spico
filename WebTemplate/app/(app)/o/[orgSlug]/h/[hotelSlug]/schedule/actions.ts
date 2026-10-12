"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeOrUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const daySchema = z
  .object({
    closed: z.boolean(),
    open: z.string().regex(TIME_RE).optional(),
    close: z.string().regex(TIME_RE).optional(),
    open2: z.string().regex(TIME_RE).optional(),
    close2: z.string().regex(TIME_RE).optional(),
  })
  .refine((d) => d.closed || (d.open !== undefined && d.close !== undefined && d.open < d.close), {
    message: "Provide a valid open/close time or mark the day closed",
  })
  .refine((d) => (d.open2 === undefined) === (d.close2 === undefined), {
    message: "Provide both a start and end time for the second shift, or leave both blank",
  })
  .refine((d) => d.open2 === undefined || d.close2 === undefined || d.open2 < d.close2, {
    message: "Second shift's start time must be before its end time",
  });

export async function updateBusinessHoursAction(formData: FormData): Promise<void> {
  const orgSlug = formData.get("orgSlug");
  const hotelSlug = formData.get("hotelSlug");
  if (typeof orgSlug !== "string" || typeof hotelSlug !== "string") {
    throw new Error("Invalid request");
  }

  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("schedules.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const upsertRows: {
    organization_id: string;
    hotel_id: string;
    day_of_week: number;
    shift_index: number;
    is_closed: boolean;
    open_time: string | null;
    close_time: string | null;
  }[] = [];
  const shift2ToDelete: number[] = [];

  for (let day = 1; day <= 7; day += 1) {
    const parsed = daySchema.safeParse({
      closed: formData.get(`day_${day}_closed`) === "on",
      open: timeOrUndefined(formData.get(`day_${day}_open`)),
      close: timeOrUndefined(formData.get(`day_${day}_close`)),
      open2: timeOrUndefined(formData.get(`day_${day}_open2`)),
      close2: timeOrUndefined(formData.get(`day_${day}_close2`)),
    });
    if (!parsed.success) {
      throw new Error(`Day ${day}: ${parsed.error.issues[0]?.message ?? "invalid schedule"}`);
    }
    const d = parsed.data;

    upsertRows.push({
      organization_id: organization.id,
      hotel_id: hotel.id,
      day_of_week: day,
      shift_index: 1,
      is_closed: d.closed,
      open_time: d.closed ? null : (d.open ?? null),
      close_time: d.closed ? null : (d.close ?? null),
    });

    if (!d.closed && d.open2 && d.close2) {
      upsertRows.push({
        organization_id: organization.id,
        hotel_id: hotel.id,
        day_of_week: day,
        shift_index: 2,
        is_closed: false,
        open_time: d.open2,
        close_time: d.close2,
      });
    } else {
      shift2ToDelete.push(day);
    }
  }

  const { error: upsertError } = await supabase
    .from("hotel_business_hours")
    .upsert(upsertRows, { onConflict: "hotel_id,day_of_week,shift_index" });

  if (upsertError) {
    throw new Error(`Failed to save business hours: ${upsertError.message}`);
  }

  if (shift2ToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("hotel_business_hours")
      .delete()
      .eq("hotel_id", hotel.id)
      .eq("shift_index", 2)
      .in("day_of_week", shift2ToDelete);

    if (deleteError) {
      throw new Error(`Failed to clear removed shifts: ${deleteError.message}`);
    }
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "hotel.business_hours_updated",
    targetType: "hotel",
    targetId: hotel.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { days: upsertRows.length },
  });
}

const holidaySchema = z
  .object({
    orgSlug: z.string().min(1),
    hotelSlug: z.string().min(1),
    name: z.string().min(1, "Name is required").max(120),
    dateStart: z.string().min(1, "Start date is required"),
    dateEnd: z.string().optional(),
    status: z.enum(["closed", "modified_hours", "special_operations"]),
    openTime: z.string().regex(TIME_RE).optional(),
    closeTime: z.string().regex(TIME_RE).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((d) => d.status !== "modified_hours" || (d.openTime && d.closeTime && d.openTime < d.closeTime), {
    message: "Modified hours require a valid open/close time",
    path: ["openTime"],
  });

export async function createHolidayAction(formData: FormData): Promise<void> {
  const result = holidaySchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
    dateStart: formData.get("dateStart"),
    dateEnd: timeOrUndefined(formData.get("dateEnd")),
    status: formData.get("status"),
    openTime: timeOrUndefined(formData.get("openTime")),
    closeTime: timeOrUndefined(formData.get("closeTime")),
    notes: timeOrUndefined(formData.get("notes")),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("holidays.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: holiday, error } = await supabase
    .from("hotel_holidays")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      name: parsed.name,
      date_start: parsed.dateStart,
      date_end: parsed.dateEnd ?? parsed.dateStart,
      status: parsed.status,
      open_time: parsed.status === "modified_hours" ? (parsed.openTime ?? null) : null,
      close_time: parsed.status === "modified_hours" ? (parsed.closeTime ?? null) : null,
      notes: parsed.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !holiday) {
    throw new Error(error?.message ?? "Failed to create holiday");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "hotel.holiday_created",
    targetType: "hotel_holiday",
    targetId: holiday.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: parsed,
  });
}

const deleteHolidaySchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  holidayId: z.string().min(1),
});

export async function deleteHolidayAction(formData: FormData): Promise<void> {
  const result = deleteHolidaySchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    holidayId: formData.get("holidayId"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("holidays.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("hotel_holidays")
    .select("name, date_start, date_end, status")
    .eq("id", parsed.holidayId)
    .single();

  const { error } = await supabase.from("hotel_holidays").delete().eq("id", parsed.holidayId);
  if (error) {
    throw new Error(`Failed to delete holiday: ${error.message}`);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "hotel.holiday_deleted",
    targetType: "hotel_holiday",
    targetId: parsed.holidayId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before,
  });
}
