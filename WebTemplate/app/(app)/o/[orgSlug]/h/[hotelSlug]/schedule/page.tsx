import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { updateBusinessHoursAction, createHolidayAction, deleteHolidayAction } from "./actions";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("schedules.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManageSchedule = await hasPermission(user.id, "schedules.manage", { hotelId: hotel.id });
  const canManageHolidays = await hasPermission(user.id, "holidays.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const [{ data: hours, error: hoursError }, { data: holidays, error: holidaysError }] = await Promise.all([
    supabase
      .from("hotel_business_hours")
      .select("day_of_week, shift_index, is_closed, open_time, close_time")
      .eq("hotel_id", hotel.id),
    supabase
      .from("hotel_holidays")
      .select("id, name, date_start, date_end, status, open_time, close_time, notes")
      .eq("hotel_id", hotel.id)
      .order("date_start", { ascending: true }),
  ]);

  if (hoursError) throw new Error(`Failed to load business hours: ${hoursError.message}`);
  if (holidaysError) throw new Error(`Failed to load holidays: ${holidaysError.message}`);

  const shift1ByDay = new Map((hours ?? []).filter((h) => h.shift_index === 1).map((h) => [h.day_of_week, h]));
  const shift2ByDay = new Map((hours ?? []).filter((h) => h.shift_index === 2).map((h) => [h.day_of_week, h]));

  return (
    <div className="pt--40">
      <h4 className="title">
        {hotel.name} — Business Hours &amp; Holidays ({hotel.timezone})
      </h4>

      <h5 className="title mt--20">Weekly business hours</h5>
      <form action={updateBusinessHoursAction}>
        <input type="hidden" name="orgSlug" value={orgSlug} />
        <input type="hidden" name="hotelSlug" value={hotelSlug} />
        <table className="spico-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Closed</th>
              <th>Open</th>
              <th>Close</th>
              <th>2nd shift open</th>
              <th>2nd shift close</th>
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((label, index) => {
              const day = index + 1;
              const shift1 = shift1ByDay.get(day);
              const shift2 = shift2ByDay.get(day);
              return (
                <tr key={day}>
                  <td>{label}</td>
                  <td>
                    <input
                      type="checkbox"
                      name={`day_${day}_closed`}
                      defaultChecked={shift1?.is_closed ?? false}
                      disabled={!canManageSchedule}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`day_${day}_open`}
                      defaultValue={shift1?.open_time?.slice(0, 5) ?? ""}
                      disabled={!canManageSchedule}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`day_${day}_close`}
                      defaultValue={shift1?.close_time?.slice(0, 5) ?? ""}
                      disabled={!canManageSchedule}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`day_${day}_open2`}
                      defaultValue={shift2?.open_time?.slice(0, 5) ?? ""}
                      disabled={!canManageSchedule}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      name={`day_${day}_close2`}
                      defaultValue={shift2?.close_time?.slice(0, 5) ?? ""}
                      disabled={!canManageSchedule}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="spico-muted">2nd shift columns are optional — leave both blank for a single continuous shift.</p>
        {canManageSchedule && (
          <button type="submit" className="rts-btn btn-primary mt--20">
            Save business hours
          </button>
        )}
      </form>

      <h5 className="title mt--30">Holidays &amp; exceptions</h5>
      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Dates</th>
            <th>Status</th>
            <th>Hours</th>
            <th>Notes</th>
            {canManageHolidays && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(holidays ?? []).map((holiday) => (
            <tr key={holiday.id}>
              <td>{holiday.name}</td>
              <td>
                {holiday.date_start === holiday.date_end
                  ? holiday.date_start
                  : `${holiday.date_start} → ${holiday.date_end}`}
              </td>
              <td>{holiday.status.replace("_", " ")}</td>
              <td>
                {holiday.status === "modified_hours" && holiday.open_time && holiday.close_time
                  ? `${holiday.open_time.slice(0, 5)}–${holiday.close_time.slice(0, 5)}`
                  : "—"}
              </td>
              <td>{holiday.notes ?? ""}</td>
              {canManageHolidays && (
                <td>
                  <form action={deleteHolidayAction}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="holidayId" value={holiday.id} />
                    <ConfirmSubmitButton
                      className="rts-btn btn-primary"
                      confirmMessage="Remove this holiday / closure date?"
                      pendingLabel="Removing…"
                    >
                      Remove
                    </ConfirmSubmitButton>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {(holidays ?? []).length === 0 && (
            <tr>
              <td colSpan={canManageHolidays ? 6 : 5}>No holidays or exceptions yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManageHolidays && (
        <form action={createHolidayAction} className="mt--20">
          <input type="hidden" name="orgSlug" value={orgSlug} />
          <input type="hidden" name="hotelSlug" value={hotelSlug} />
          <div className="input-wrapper">
            <label className="visually-hidden" htmlFor="holiday-name">
              Name
            </label>
            <input id="holiday-name" name="name" type="text" placeholder="e.g. New Year's Day" required />
          </div>
          <div className="input-wrapper">
            <label htmlFor="dateStart">Start date</label>
            <input id="dateStart" name="dateStart" type="date" required />
          </div>
          <div className="input-wrapper">
            <label htmlFor="dateEnd">End date (optional, for a range)</label>
            <input id="dateEnd" name="dateEnd" type="date" />
          </div>
          <div className="input-wrapper">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue="closed">
              <option value="closed">Closed</option>
              <option value="modified_hours">Modified hours</option>
              <option value="special_operations">Special operations</option>
            </select>
          </div>
          <div className="input-wrapper">
            <label htmlFor="openTime">Open time (if modified hours)</label>
            <input id="openTime" name="openTime" type="time" />
          </div>
          <div className="input-wrapper">
            <label htmlFor="closeTime">Close time (if modified hours)</label>
            <input id="closeTime" name="closeTime" type="time" />
          </div>
          <div className="input-wrapper">
            <label className="visually-hidden" htmlFor="notes">
              Notes
            </label>
            <input id="notes" name="notes" type="text" placeholder="Notes (optional)" />
          </div>
          <button type="submit" className="rts-btn btn-primary">
            Add holiday
          </button>
        </form>
      )}
    </div>
  );
}
