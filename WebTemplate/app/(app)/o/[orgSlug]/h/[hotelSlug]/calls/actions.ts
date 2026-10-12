"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const noteSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  callId: z.string().min(1),
  note: z.string().min(1, "Note is required").max(2000),
});

export async function addCallNoteAction(formData: FormData): Promise<void> {
  const result = noteSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    callId: formData.get("callId"),
    note: formData.get("note"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("calls.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: call } = await supabase.from("calls").select("notes").eq("id", p.callId).eq("hotel_id", hotel.id).single();
  if (!call) {
    await flash("error", "Call not found");
    return;
  }

  const combinedNotes = call.notes ? `${call.notes}\n---\n${p.note}` : p.note;
  const { error } = await supabase.from("calls").update({ notes: combinedNotes }).eq("id", p.callId).eq("hotel_id", hotel.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", "Note added");

  await supabase.from("call_events").insert({ call_id: p.callId, event_type: "call.note", payload: { note: p.note } });

  await writeAuditLog({
    actorProfileId: user.id,
    action: "call.note_added",
    targetType: "call",
    targetId: p.callId,
    organizationId: organization.id,
    hotelId: hotel.id,
  });
}

const completeHandoffSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  callId: z.string().min(1),
});

export async function markHandoffCompletedAction(formData: FormData): Promise<void> {
  const result = completeHandoffSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    callId: formData.get("callId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const p = result.data;

  const organization = await getOrganizationBySlugOrNotFound(p.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, p.hotelSlug);
  const user = await requirePermission("calls.manage", { hotelId: hotel.id, organizationId: organization.id });

  const supabase = await createClient();
  const { data: call } = await supabase.from("calls").select("disposition").eq("id", p.callId).eq("hotel_id", hotel.id).single();
  if (!call) {
    await flash("error", "Call not found");
    return;
  }
  if (call.disposition !== "handoff_required") {
    await flash("error", "This call is not awaiting handoff");
    return;
  }

  const { error } = await supabase
    .from("calls")
    .update({ disposition: "handoff_completed" })
    .eq("id", p.callId)
    .eq("hotel_id", hotel.id);
  if (error) {
    await flash("error", error.message);
    return;
  }

  await flash("success", "Handoff marked completed");

  await supabase.from("call_events").insert({ call_id: p.callId, event_type: "call.handoff_completed", payload: {} });

  await writeAuditLog({
    actorProfileId: user.id,
    action: "call.handoff_completed",
    targetType: "call",
    targetId: p.callId,
    organizationId: organization.id,
    hotelId: hotel.id,
  });
}
