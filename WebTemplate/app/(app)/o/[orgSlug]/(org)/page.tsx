import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { getOrganizationBySlugOrNotFound, listHotelsForOrganization } from "@/lib/data";
import { StatusChip } from "@/components/ui/StatusChip";

export default async function OrgHotelsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotels = await listHotelsForOrganization(organization.id);

  return (
    <div className="pt--40">
      <PageHeader title="Hotels" subtitle={organization.name} />
      {hotels.length === 0 ? (
        <p>No hotels yet.</p>
      ) : (
        <ul className="spico-plain-list">
          {hotels.map((hotel) => (
            <li key={hotel.id} className="spico-inline-form" style={{ justifyContent: "space-between" }}>
              <Link href={`/o/${organization.slug}/h/${hotel.slug}`}>{hotel.name}</Link>
              <StatusChip status={hotel.status} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt--20">
        <Link href={`/o/${organization.slug}/hotels/new`} className="rts-btn btn-primary">
          Add hotel
        </Link>
      </p>
    </div>
  );
}
