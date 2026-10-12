import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { env } from "@/lib/env";
import { StatusChip } from "@/components/ui/StatusChip";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import {
  inviteMemberAction,
  changeRoleAction,
  revokeMemberAction,
  assignDepartmentAction,
  unassignDepartmentAction,
} from "./actions";

export default async function TeamPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  await requirePermission("team.view", { organizationId: organization.id });

  const supabase = await createClient();
  const [{ data: memberships, error: membershipsError }, { data: roles }, { data: hotels }, { data: invitations }] =
    await Promise.all([
      supabase
        .from("memberships")
        .select("id, profile_id, hotel_id, role_key, status")
        .eq("organization_id", organization.id)
        .order("created_at"),
      supabase.from("roles").select("key, label, rank").order("rank"),
      supabase.from("hotels").select("id, name").eq("organization_id", organization.id),
      supabase
        .from("invitations")
        .select("id, email, role_key, hotel_id, token, status, expires_at")
        .eq("organization_id", organization.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  if (membershipsError) {
    throw new Error(`Failed to load team: ${membershipsError.message}`);
  }

  const profileIds = Array.from(new Set((memberships ?? []).map((m) => m.profile_id)));
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", profileIds)
    : { data: [] };

  const hotelIds = (hotels ?? []).map((h) => h.id);
  const { data: departments } = hotelIds.length
    ? await supabase.from("departments").select("id, hotel_id, name").eq("status", "active").in("hotel_id", hotelIds)
    : { data: [] };

  const membershipIds = (memberships ?? []).map((m) => m.id);
  const { data: assignments } = membershipIds.length
    ? await supabase
        .from("membership_departments")
        .select("membership_id, department_id")
        .in("membership_id", membershipIds)
    : { data: [] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const hotelById = new Map((hotels ?? []).map((h) => [h.id, h]));
  const departmentById = new Map((departments ?? []).map((d) => [d.id, d]));
  const departmentsByHotel = new Map<string, { id: string; name: string }[]>();
  for (const dept of departments ?? []) {
    const list = departmentsByHotel.get(dept.hotel_id) ?? [];
    list.push({ id: dept.id, name: dept.name });
    departmentsByHotel.set(dept.hotel_id, list);
  }
  const assignedByMembership = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    const list = assignedByMembership.get(assignment.membership_id) ?? [];
    list.push(assignment.department_id);
    assignedByMembership.set(assignment.membership_id, list);
  }

  return (
    <div className="pt--40">
      <h4 className="title">{organization.name} — Team &amp; Roles</h4>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Scope</th>
            <th>Departments</th>
            <th>Status</th>
            <th>Revoke</th>
          </tr>
        </thead>
        <tbody>
          {(memberships ?? []).map((membership) => {
            const profile = profileById.get(membership.profile_id);
            const hotel = membership.hotel_id ? hotelById.get(membership.hotel_id) : null;
            const assignedIds = assignedByMembership.get(membership.id) ?? [];
            const hotelDepartments = membership.hotel_id ? (departmentsByHotel.get(membership.hotel_id) ?? []) : [];
            const unassignedDepartments = hotelDepartments.filter((d) => !assignedIds.includes(d.id));

            return (
              <tr key={membership.id}>
                <td>{profile?.full_name ?? profile?.email ?? membership.profile_id}</td>
                <td>
                  <form action={changeRoleAction} className="spico-inline-form">
                    <input type="hidden" name="orgSlug" value={organization.slug} />
                    <input type="hidden" name="membershipId" value={membership.id} />
                    <select name="roleKey" defaultValue={membership.role_key}>
                      {(roles ?? []).map((role) => (
                        <option key={role.key} value={role.key}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="rts-btn btn-secondary btn-sm">
                      Update
                    </button>
                  </form>
                </td>
                <td>{hotel ? hotel.name : "Organization-wide"}</td>
                <td>
                  {!membership.hotel_id ? (
                    "—"
                  ) : (
                    <>
                      <div className="spico-badge-list">
                        {assignedIds.map((deptId) => (
                          <span className="spico-badge" key={deptId}>
                            {departmentById.get(deptId)?.name ?? deptId}
                            <form action={unassignDepartmentAction} style={{ display: "inline" }}>
                              <input type="hidden" name="orgSlug" value={organization.slug} />
                              <input type="hidden" name="membershipId" value={membership.id} />
                              <input type="hidden" name="departmentId" value={deptId} />
                              <button type="submit" aria-label="Unassign department">
                                ×
                              </button>
                            </form>
                          </span>
                        ))}
                      </div>
                      {unassignedDepartments.length > 0 && (
                        <form action={assignDepartmentAction} className="spico-inline-form mt--10">
                          <input type="hidden" name="orgSlug" value={organization.slug} />
                          <input type="hidden" name="membershipId" value={membership.id} />
                          <select name="departmentId" defaultValue="">
                            <option value="" disabled>
                              Assign department
                            </option>
                            {unassignedDepartments.map((dept) => (
                              <option key={dept.id} value={dept.id}>
                                {dept.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="rts-btn btn-secondary btn-sm">
                            Assign
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </td>
                <td>
                  <StatusChip status={membership.status} />
                </td>
                <td>
                  <form action={revokeMemberAction}>
                    <input type="hidden" name="orgSlug" value={organization.slug} />
                    <input type="hidden" name="membershipId" value={membership.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Revoke ${profile?.full_name ?? profile?.email ?? "this member"}'s access? They will lose access immediately.`}
                      pendingLabel="Revoking…"
                    >
                      Revoke
                    </ConfirmSubmitButton>
                  </form>
                </td>
              </tr>
            );
          })}
          {(memberships ?? []).length === 0 && (
            <tr>
              <td colSpan={6}>No team members yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h5 className="title mt--30">Invite a member</h5>
      <form action={inviteMemberAction}>
        <input type="hidden" name="orgSlug" value={organization.slug} />
        <div className="input-wrapper">
          <label className="visually-hidden" htmlFor="invite-email">
            Email address
          </label>
          <input id="invite-email" type="text" name="email" placeholder="Email address" required />
        </div>
        <select name="roleKey" required defaultValue="">
          <option value="" disabled>
            Select a role
          </option>
          {(roles ?? []).map((role) => (
            <option key={role.key} value={role.key}>
              {role.label}
            </option>
          ))}
        </select>
        <select name="hotelId" defaultValue="">
          <option value="">Organization-wide</option>
          {(hotels ?? []).map((hotel) => (
            <option key={hotel.id} value={hotel.id}>
              {hotel.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rts-btn btn-primary">
          Send invite
        </button>
      </form>

      {(invitations ?? []).length > 0 && (
        <>
          <h5 className="title mt--30">Pending invitations</h5>
          <p className="spico-muted">Share the link below with the invited person — they must accept it while logged in.</p>
          <table className="spico-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Expires</th>
                <th>Invite link</th>
              </tr>
            </thead>
            <tbody>
              {(invitations ?? []).map((invitation) => {
                const roleLabel = (roles ?? []).find((r) => r.key === invitation.role_key)?.label ?? invitation.role_key;
                const hotel = invitation.hotel_id ? (hotels ?? []).find((h) => h.id === invitation.hotel_id) : null;
                const link = `${env.NEXT_PUBLIC_APP_URL}/invite/${invitation.token}`;
                return (
                  <tr key={invitation.id}>
                    <td>{invitation.email}</td>
                    <td>{roleLabel}</td>
                    <td>{hotel ? hotel.name : "Organization-wide"}</td>
                    <td>{new Date(invitation.expires_at).toLocaleDateString()}</td>
                    <td>
                      <code style={{ wordBreak: "break-all" }}>{link}</code>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
