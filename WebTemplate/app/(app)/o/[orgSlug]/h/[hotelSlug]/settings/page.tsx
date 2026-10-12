import { PageHeader } from "@/components/layout/PageHeader";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { HotelSettingsForm } from "./HotelSettingsForm";

export default async function HotelSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("hotel.settings.manage", { hotelId: hotel.id, organizationId: organization.id });

  return (
    <div className="pt--40">
      <PageHeader title="Settings" subtitle={`${hotel.name} · ${organization.name}`} />
      <p className="spico-muted">Platform-level configuration is managed separately and never appears here.</p>
      <HotelSettingsForm hotel={hotel} orgSlug={orgSlug} hotelSlug={hotelSlug} />
    </div>
  );
}
