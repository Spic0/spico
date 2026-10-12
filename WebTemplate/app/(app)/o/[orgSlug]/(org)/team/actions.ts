"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { checkMembershipCreationAllowed } from "@/lib/planLimits";
import { flash } from "@/lib/flash";

const roleKeys = [
  "receptionist",
  "reception_manager",
  "reception_managers_manager",
  "hotel_general_manager",
  "hotel_owner",
] as const;

const inviteSchema = z.object({
  orgSlug: z.string().min(1),
  email: z
    .string()
    .min(3)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email"),
  roleKey: z.enum(roleKeys),
  hotelId: z.string().optional(),
});

// RLS (invitations_insert_permission, via can_manage_membership) is the
// authoritative check — this action just gives a clean error instead of a
// raw Postgres denial.
export async function inviteMemberAction(formData: FormData): Promise<void> {
  const result = inviteSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    email: formData.get("email"),
    roleKey: formData.get("roleKey"),
    hotelId: formData.get("hotelId") || undefined,
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;
  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const user = await requireUser();

  const planLimit = await checkMembershipCreationAllowed(organization.id);
  if (!planLimit.allowed) {
    await flash("error", planLimit.reason ?? "This organization's plan does not allow inviting another team member.");
    return;
  }

  const supabase = await createClient();
  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      organization_id: organization.id,
      hotel_id: parsed.hotelId || null,
      email: parsed.email,
      role_key: parsed.roleKey,
    })
    .select("id")
    .single();

  if (error || !invitation) {
    await flash("error", error?.message ?? "Not authorized to invite members with this role/scope");
    return;
  }

  await flash("success", `Invitation sent to ${parsed.email}`);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "invitation.created",
    targetType: "invitation",
    targetId: invitation.id,
    organizationId: organization.id,
    hotelId: parsed.hotelId || null,
    after: { email: parsed.email, roleKey: parsed.roleKey },
  });

  revalidatePath(`/o/${organization.slug}/team`);
}

const changeRoleSchema = z.object({
  orgSlug: z.string().min(1),
  membershipId: z.string().min(1),
  roleKey: z.enum(roleKeys),
});

export async function changeRoleAction(formData: FormData): Promise<void> {
  const result = changeRoleSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    membershipId: formData.get("membershipId"),
    roleKey: formData.get("roleKey"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;
  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const user = await requireUser();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("memberships")
    .select("role_key")
    .eq("id", parsed.membershipId)
    .single();

  const { data, error } = await supabase
    .from("memberships")
    .update({ role_key: parsed.roleKey })
    .eq("id", parsed.membershipId)
    .select("id")
    .single();

  if (error || !data) {
    await flash("error", error?.message ?? "Not authorized to change this membership's role");
    return;
  }

  await flash("success", "Role updated");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "membership.role_changed",
    targetType: "membership",
    targetId: parsed.membershipId,
    organizationId: organization.id,
    before,
    after: { roleKey: parsed.roleKey },
  });

  revalidatePath(`/o/${organization.slug}/team`);
}

const revokeSchema = z.object({
  orgSlug: z.string().min(1),
  membershipId: z.string().min(1),
});

export async function revokeMemberAction(formData: FormData): Promise<void> {
  const result = revokeSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    membershipId: formData.get("membershipId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;
  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .update({ status: "revoked" })
    .eq("id", parsed.membershipId)
    .select("id")
    .single();

  if (error || !data) {
    await flash("error", error?.message ?? "Not authorized to revoke this membership");
    return;
  }

  await flash("success", "Member access revoked");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "membership.revoked",
    targetType: "membership",
    targetId: parsed.membershipId,
    organizationId: organization.id,
  });

  revalidatePath(`/o/${organization.slug}/team`);
}

const assignDepartmentSchema = z.object({
  orgSlug: z.string().min(1),
  membershipId: z.string().min(1),
  departmentId: z.string().min(1),
});

// Department assignment only applies to hotel-scoped memberships (a
// department belongs to one specific hotel) — resolved from the membership
// row itself, not trusted from the form, so the permission check is scoped
// to the membership's actual hotel.
export async function assignDepartmentAction(formData: FormData): Promise<void> {
  const result = assignDepartmentSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    membershipId: formData.get("membershipId"),
    departmentId: formData.get("departmentId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;
  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("memberships")
    .select("hotel_id")
    .eq("id", parsed.membershipId)
    .single();

  if (!membership?.hotel_id) {
    await flash("error", "Only hotel-scoped memberships can be assigned to a department");
    return;
  }

  const user = await requirePermission("team.departments.assign", {
    hotelId: membership.hotel_id,
    organizationId: organization.id,
  });

  const { data: assignment, error } = await supabase
    .from("membership_departments")
    .insert({ membership_id: parsed.membershipId, department_id: parsed.departmentId })
    .select("id")
    .single();

  if (error || !assignment) {
    await flash("error", error?.message ?? "Failed to assign department");
    return;
  }

  await flash("success", "Department assigned");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "membership.department_assigned",
    targetType: "membership",
    targetId: parsed.membershipId,
    organizationId: organization.id,
    hotelId: membership.hotel_id,
    after: { departmentId: parsed.departmentId },
  });

  revalidatePath(`/o/${organization.slug}/team`);
}

const unassignDepartmentSchema = z.object({
  orgSlug: z.string().min(1),
  membershipId: z.string().min(1),
  departmentId: z.string().min(1),
});

export async function unassignDepartmentAction(formData: FormData): Promise<void> {
  const result = unassignDepartmentSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    membershipId: formData.get("membershipId"),
    departmentId: formData.get("departmentId"),
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;
  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("memberships")
    .select("hotel_id")
    .eq("id", parsed.membershipId)
    .single();

  if (!membership?.hotel_id) {
    await flash("error", "Only hotel-scoped memberships can be unassigned from a department");
    return;
  }

  const user = await requirePermission("team.departments.assign", {
    hotelId: membership.hotel_id,
    organizationId: organization.id,
  });

  const { error } = await supabase
    .from("membership_departments")
    .delete()
    .eq("membership_id", parsed.membershipId)
    .eq("department_id", parsed.departmentId);

  if (error) {
    await flash("error", `Failed to unassign department: ${error.message}`);
    return;
  }

  await flash("success", "Department unassigned");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "membership.department_unassigned",
    targetType: "membership",
    targetId: parsed.membershipId,
    organizationId: organization.id,
    hotelId: membership.hotel_id,
    before: { departmentId: parsed.departmentId },
  });

  revalidatePath(`/o/${organization.slug}/team`);
}
