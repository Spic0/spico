import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission, hasPermission } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/pms";
import { ConfirmSubmitButton } from "@/components/ui/ConfirmSubmitButton";
import { createRatePlanSeasonAction, deleteRatePlanSeasonAction } from "./actions";

export default async function RatePlanSeasonsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; ratePlanId: string }>;
}) {
  const { orgSlug, hotelSlug, ratePlanId } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  const user = await requirePermission("pms.read", { hotelId: hotel.id, organizationId: organization.id });
  const canManage = await hasPermission(user.id, "pms.manage", { hotelId: hotel.id });

  const supabase = await createClient();
  const { data: plan } = await supabase.from("rate_plans").select("id, name, nightly_amount").eq("id", ratePlanId).eq("hotel_id", hotel.id).single();
  if (!plan) notFound();

  const { data: seasons, error } = await supabase
    .from("rate_plan_seasons")
    .select("id, name, date_start, date_end, nightly_amount")
    .eq("rate_plan_id", ratePlanId)
    .order("date_start");
  if (error) throw new Error(`Failed to load seasons: ${error.message}`);

  const base = `/o/${orgSlug}/h/${hotelSlug}/pms/rates`;
  const currency = hotel.default_currency;

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to rate plans
      </Link>
      <h4 className="title mt--10">{plan.name} — Seasonal rates</h4>
      <p className="spico-muted">
        Base rate {formatMoney(plan.nightly_amount, currency)}/night applies to any date not covered by a season
        below. If two seasons overlap a date, the shortest (most specific) one wins.
      </p>

      <table className="spico-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Start</th>
            <th>End</th>
            <th>Nightly rate</th>
            {canManage && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {(seasons ?? []).map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.date_start}</td>
              <td>{s.date_end}</td>
              <td>{formatMoney(s.nightly_amount, currency)}</td>
              {canManage && (
                <td>
                  <form action={deleteRatePlanSeasonAction}>
                    <input type="hidden" name="orgSlug" value={orgSlug} />
                    <input type="hidden" name="hotelSlug" value={hotelSlug} />
                    <input type="hidden" name="seasonId" value={s.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Remove the seasonal rate for ${s.date_start} → ${s.date_end}? Nightly pricing will revert to the base rate for those dates.`}
                      pendingLabel="Removing…"
                    >
                      Remove
                    </ConfirmSubmitButton>
                  </form>
                </td>
              )}
            </tr>
          ))}
          {(seasons ?? []).length === 0 && (
            <tr>
              <td colSpan={canManage ? 5 : 4}>No seasons yet — the base rate applies to every date.</td>
            </tr>
          )}
        </tbody>
      </table>

      {canManage && (
        <>
          <h5 className="title mt--30">Add a season</h5>
          <form action={createRatePlanSeasonAction} className="spico-inline-form" style={{ flexWrap: "wrap" }}>
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <input type="hidden" name="hotelSlug" value={hotelSlug} />
            <input type="hidden" name="ratePlanId" value={ratePlanId} />
            <input name="name" placeholder="Name, e.g. Christmas" required maxLength={120} />
            <label>
              Start <input name="dateStart" type="date" required />
            </label>
            <label>
              End <input name="dateEnd" type="date" required />
            </label>
            <input name="nightlyAmount" type="number" step="0.01" min="0" placeholder="Nightly rate" required size={8} />
            <button type="submit" className="rts-btn btn-primary">
              Add season
            </button>
          </form>
        </>
      )}
    </div>
  );
}
