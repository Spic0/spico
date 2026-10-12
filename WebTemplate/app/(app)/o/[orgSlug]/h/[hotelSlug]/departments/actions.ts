"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

const codeSchema = z
  .string()
  .min(2)
  .max(20)
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));

const createSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  code: codeSchema,
  description: z.string().max(1000).optional(),
});

export async function createDepartmentAction(formData: FormData): Promise<void> {
  const result = createSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
    code: formData.get("code"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("departments.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: department, error } = await supabase
    .from("departments")
    .insert({
      organization_id: organization.id,
      hotel_id: hotel.id,
      name: parsed.name,
      code: parsed.code,
      description: parsed.description ?? null,
    })
    .select("id")
    .single();

  if (error || !department) {
    throw new Error(error?.message ?? "Failed to create department (code may already be in use)");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "department.created",
    targetType: "department",
    targetId: department.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { name: parsed.name, code: parsed.code, description: parsed.description ?? null },
  });
}

const updateSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  departmentId: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  code: codeSchema,
  description: z.string().max(1000).optional(),
});

export async function updateDepartmentAction(formData: FormData): Promise<void> {
  const result = updateSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    departmentId: formData.get("departmentId"),
    name: formData.get("name"),
    code: formData.get("code"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("departments.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("departments")
    .select("name, code, description")
    .eq("id", parsed.departmentId)
    .single();

  const { data: updated, error } = await supabase
    .from("departments")
    .update({ name: parsed.name, code: parsed.code, description: parsed.description ?? null })
    .eq("id", parsed.departmentId)
    .select("id")
    .single();

  if (error || !updated) {
    throw new Error(error?.message ?? "Failed to update department (code may already be in use)");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "department.updated",
    targetType: "department",
    targetId: parsed.departmentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before,
    after: { name: parsed.name, code: parsed.code, description: parsed.description ?? null },
  });
}

const statusSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  departmentId: z.string().min(1),
  nextStatus: z.enum(["active", "inactive"]),
});

export async function setDepartmentStatusAction(formData: FormData): Promise<void> {
  const result = statusSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    departmentId: formData.get("departmentId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("departments.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("departments")
    .select("status")
    .eq("id", parsed.departmentId)
    .single();

  const { data: updated, error } = await supabase
    .from("departments")
    .update({ status: parsed.nextStatus })
    .eq("id", parsed.departmentId)
    .select("id")
    .single();

  if (error || !updated) {
    throw new Error(
      error?.message ?? "Failed to change department status (an active department with this code may already exist)",
    );
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "department.status_changed",
    targetType: "department",
    targetId: parsed.departmentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    before,
    after: { status: parsed.nextStatus },
  });
}
