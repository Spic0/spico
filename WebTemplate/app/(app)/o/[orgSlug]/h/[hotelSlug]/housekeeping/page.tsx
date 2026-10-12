import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { TASK_TYPES, TASK_STATUSES, taskTypeLabel, taskStatusLabel, NEXT_STATUS } from "@/lib/housekeeping";
import { StatusChip } from "@/components/ui/StatusChip";
import { createHousekeepingTaskAction, advanceHousekeepingTaskAction } from "./actions";

const FILTERS = [{ value: "all", label: "All" }, ...TASK_STATUSES];

export default async function HousekeepingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const { status: filter = "pending" } = await searchParams;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("housekeeping.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "housekeeping.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  let query = supabase
    .from("housekeeping_tasks")
    .select("id, room_id, task_type, status, priority, assigned_to, notes, created_at")
    .eq("hotel_id", hotel.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter !== "all") query = query.eq("status", filter);
  const { data: tasks, error } = await query;
  if (error) throw new Error(`Failed to load housekeeping tasks: ${error.message}`);

  const rows = tasks ?? [];
  const roomIds = Array.from(new Set(rows.map((t) => t.room_id)));
  const assigneeIds = Array.from(new Set(rows.map((t) => t.assigned_to).filter((id): id is string => id !== null)));

  const [{ data: rooms }, { data: memberships }, { data: activeRooms }] = await Promise.all([
    roomIds.length ? supabase.from("rooms").select("id, room_number").in("id", roomIds) : Promise.resolve({ data: [] as { id: string; room_number: string }[] }),
    assigneeIds.length
      ? supabase.from("memberships").select("id, profile_id").in("id", assigneeIds)
      : Promise.resolve({ data: [] as { id: string; profile_id: string }[] }),
    supabase.from("rooms").select("id, room_number").eq("hotel_id", hotel.id).eq("status", "active").order("room_number"),
  ]);
  const profileIds = Array.from(new Set((memberships ?? []).map((m) => m.profile_id)));
  const { data: profiles } = profileIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", profileIds)
    : { data: [] as { id: string; email: string; full_name: string | null }[] };

  const roomNumber = new Map((rooms ?? []).map((r) => [r.id, r.room_number]));
  const assigneeName = new Map(
    (memberships ?? []).map((m) => {
      const p = (profiles ?? []).find((x) => x.id === m.profile_id);
      return [m.id, p?.full_name || p?.email || "Member"];
    }),
  );

  const base = `/o/${orgSlug}/h/${hotelSlug}/housekeeping`;

  return (
    <div className="pt--40">
      <PageHeader title="Housekeeping" subtitle={`${hotel.name} · ${organization.name}`} />

      <div className="spico-tab-nav">
        {FILTERS.map((f) => (
          <Link key={f.value} href={`${base}?status=${f.value}`} className={`spico-tab-nav-item ${filter === f.value ? "active" : ""}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Assigned to</th>
            <th>Status</th>
            <th>Created</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const next = NEXT_STATUS[t.status as keyof typeof NEXT_STATUS];
            return (
              <tr key={t.id}>
                <td>{roomNumber.get(t.room_id) ?? "—"}</td>
                <td>{taskTypeLabel(t.task_type)}</td>
                <td>
                  <StatusChip
                    status={t.priority}
                    variant={t.priority === "high" ? "danger" : t.priority === "low" ? "info" : "neutral"}
                  />
                </td>
                <td>{t.assigned_to ? (assigneeName.get(t.assigned_to) ?? "—") : "Unassigned"}</td>
                <td>
                  <StatusChip status={t.status} />
                </td>
                <td className="spico-muted">{new Date(t.created_at).toLocaleString()}</td>
                {canManage && (
                  <td>
                    {next && (
                      <form action={advanceHousekeepingTaskAction}>
                        <input type="hidden" name="orgSlug" value={orgSlug} />
                        <input type="hidden" name="hotelSlug" value={hotelSlug} />
                        <input type="hidden" name="taskId" value={t.id} />
                        <input type="hidden" name="currentStatus" value={t.status} />
                        <button type="submit" className="rts-btn btn-primary">
                          Mark {taskStatusLabel(next)}
                        </button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={canManage ? 7 : 6}>No tasks{filter !== "all" ? ` with status "${filter}"` : ""}.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Create a task</h5>
          <form action={createHousekeepingTaskAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <select name="roomId" required aria-label="Room">
              {(activeRooms ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  Room {r.room_number}
                </option>
              ))}
            </select>
            <select name="taskType" defaultValue="stayover_clean" aria-label="Type">
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select name="priority" defaultValue="normal" aria-label="Priority">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
            <input name="notes" placeholder="Notes (optional)" maxLength={1000} />
            <button type="submit" className="rts-btn btn-primary">
              Create task
            </button>
          </form>
        </>
      )}
    </div>
  );
}
