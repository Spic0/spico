import { notFound } from "next/navigation";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { findHotelModule } from "@/lib/nav";

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
      <h4 className="title">
        {hotel.name} — {hotelModule.label}
      </h4>
      <p>{hotelModule.description}</p>
      <p className="spico-muted">Planned for {hotelModule.milestone} — see docs/roadmap.md. Not implemented yet.</p>
    </div>
  );
}
