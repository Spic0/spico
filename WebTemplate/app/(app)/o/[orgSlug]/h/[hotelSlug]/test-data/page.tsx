import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requireOwnerOrSuperadmin, isDemoDataSeedingEnabled } from "@/lib/demoData";
import { createClient } from "@/lib/supabase/server";
import { SeedTestDataForm, RemoveTestDataForm } from "./TestDataForms";

const TEST_DATA_TABLES = [
  "room_types",
  "rooms",
  "rate_plans",
  "guests",
  "reservations",
  "ai_agents",
  "kb_categories",
  "kb_articles",
  "channels",
  "conversations",
  "messages",
  "booking_settings",
] as const;

export default async function TestDataPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  // Deliberately not requirePermission() — Hotel Owner + Platform Superadmin
  // only, excluding Platform Admin. See lib/demoData.ts.
  await requireOwnerOrSuperadmin(hotel.id, organization.id);

  const enabled = isDemoDataSeedingEnabled();

  let totalTestRows = 0;
  if (enabled) {
    const supabase = await createClient();
    const counts = await Promise.all(
      TEST_DATA_TABLES.map((table) =>
        supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("hotel_id", hotel.id)
          .eq("is_test_data", true),
      ),
    );
    totalTestRows = counts.reduce((sum, c) => sum + (c.count ?? 0), 0);
  }

  return (
    <div className="pt--40">
      <h4 className="title">
        {hotel.name} — Test Data <span className="spico-muted">· {organization.name}</span>
      </h4>
      <p className="spico-muted">
        Internal-only tool for seeding safe, clearly labelled test data (room types, rooms, rate plans, guests,
        reservations, a draft AI agent, knowledge base content, and a sample inbox conversation) into <strong>{hotel.name}</strong> only —
        never into another hotel or organization. Restricted to this hotel&apos;s Owner and Platform Superadmin.
      </p>

      {!enabled ? (
        <div className="spico-callout">
          <strong>Test-data seeding is disabled in this environment.</strong> Set{" "}
          <code>ENABLE_DEMO_DATA_SEEDING=true</code> to enable it — never in a deployment serving real tenants. See
          .env.example.
        </div>
      ) : (
        <>
          <div className="spico-panel">
            <strong>{totalTestRows}</strong> test-data row(s) currently exist for this hotel.
          </div>
          <div className="spico-two-col">
            <div className="spico-panel">
              <h5 className="title">Seed test data</h5>
              <p className="spico-muted">
                Idempotent — running this again never duplicates rows, and existing booking-engine settings are
                never overwritten if this hotel already has them configured. Every seeded row is labelled
                &quot;Test Data — Not a Real Guest or Reservation&quot;.
              </p>
              <SeedTestDataForm orgSlug={orgSlug} hotelSlug={hotelSlug} />
            </div>
            <div className="spico-panel">
              <h5 className="title">Remove test data</h5>
              <p className="spico-muted">
                Deletes only rows this tool created (is_test_data = true). Manually created data is never touched.
              </p>
              <RemoveTestDataForm orgSlug={orgSlug} hotelSlug={hotelSlug} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
