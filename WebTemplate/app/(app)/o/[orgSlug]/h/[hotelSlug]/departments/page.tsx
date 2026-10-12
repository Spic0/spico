import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/ui/StatusChip";
import { createDepartmentAction, updateDepartmentAction, setDepartmentStatusAction } from "./actions";

export default async function DepartmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("departments.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "departments.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: departments, error } = await supabase
    .from("departments")
    .select("id, name, code, description, status")
    .eq("hotel_id", hotel.id)
    .order("name");

  if (error) {
    throw new Error(`Failed to load departments: ${error.message}`);
  }

  return (
    <div className="pt--40">
      <h4 className="title">{hotel.name} — Departments</h4>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Code</th>
            <th>Description</th>
            <th>Status</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(departments ?? []).map((department) => (
            <tr key={department.id}>
              {canManage ? (
                <>
                  <td colSpan={3}>
                    <form action={updateDepartmentAction} className="spico-inline-form">
                      <input type="hidden" name="orgSlug" value={orgSlug} />
                      <input type="hidden" name="hotelSlug" value={hotelSlug} />
                      <input type="hidden" name="departmentId" value={department.id} />
                      <input name="name" type="text" defaultValue={department.name} required />
                      <input name="code" type="text" defaultValue={department.code} required maxLength={20} />
                      <input
                        name="description"
                        type="text"
                        defaultValue={department.description ?? ""}
                        placeholder="Description"
                      />
                      <button type="submit" className="rts-btn btn-primary">
                        Save
                      </button>
                    </form>
                  </td>
                </>
              ) : (
                <>
                  <td>{department.name}</td>
                  <td>{department.code}</td>
                  <td>{department.description ?? ""}</td>
                </>
              )}
              <td>
                <StatusChip status={department.status} />
              </td>
              {canManage && (
                <td>
                  <form action={setDepartmentStatusAction}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="departmentId" value={department.id} />
                    <input
                      type="hidden"
                      name="nextStatus"
                      value={department.status === "active" ? "inactive" : "active"}
                    />
                    <button type="submit" className="rts-btn btn-secondary btn-sm">
                      {department.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {(departments ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 4 : 4}>No departments yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Add a department</h5>
          <form action={createDepartmentAction}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <div className="input-wrapper">
              <label className="visually-hidden" htmlFor="dept-name">
                Name
              </label>
              <input id="dept-name" name="name" type="text" placeholder="Department name" required />
            </div>
            <div className="input-wrapper">
              <label className="visually-hidden" htmlFor="dept-code">
                Code
              </label>
              <input
                id="dept-code"
                name="code"
                type="text"
                placeholder="Code, e.g. LAUNDRY"
                maxLength={20}
                required
              />
            </div>
            <div className="input-wrapper">
              <label className="visually-hidden" htmlFor="dept-description">
                Description
              </label>
              <input id="dept-description" name="description" type="text" placeholder="Description (optional)" />
            </div>
            <button type="submit" className="rts-btn btn-primary">
              Add department
            </button>
          </form>
        </>
      )}
    </div>
  );
}
