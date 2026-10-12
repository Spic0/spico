import { PageHeader } from "@/components/layout/PageHeader";
import { OrgDialog } from "./OrgDialog";

export default function NewOrganizationPage() {
  return (
    <div className="main-center-content-m-left center-content pt--40">
      <div className="container-30">
        <PageHeader title="Create your organization" subtitle="Get started with Spico" />
        <p className="spico-muted mt--20">
          An organization is your company or hotel chain. Create it to add your first hotel.
        </p>
        <OrgDialog />
      </div>
    </div>
  );
}
