import { notFound } from "next/navigation";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { findHotelModule } from "@/lib/nav";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function HotelModulePlaceholderPage({
  params,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string; module: string }>;
}) {
  const { orgSlug, hotelSlug, module } = await params;
  const hotelModule = findHotelModule(module);
  if (!hotelModule) {
    notFound();
  }

  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);

  return (
    <div className="pt--40">
      <PageHeader title={hotelModule.label} subtitle={`${hotel.name} · ${organization.name}`} />
      <p>{hotelModule.description}</p>
      <p className="spico-muted">Planned for {hotelModule.milestone} — see docs/roadmap.md. Not implemented yet.</p>
    </div>
  );
}
