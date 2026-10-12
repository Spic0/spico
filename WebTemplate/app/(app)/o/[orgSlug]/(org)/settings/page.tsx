import { PageHeader } from "@/components/layout/PageHeader";
import { getOrganizationBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";

export default async function OrgSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  await requirePermission("hotel.settings.manage", { organizationId: organization.id });

  return (
    <div className="pt--40">
      <PageHeader title="Settings" subtitle={organization.name} />
      <p>Organization-level settings (branding, default language, etc.) will live here.</p>
      <p className="spico-muted">
        Not implemented yet — see docs/roadmap.md. Billing has its own page: see the Billing tab.
      </p>
    </div>
  );
}
