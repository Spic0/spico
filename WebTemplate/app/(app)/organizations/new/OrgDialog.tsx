"use client";

import { WizardDialog, Field } from "@/components/ui/WizardDialog";
import { createOrganizationAction } from "./actions";

// First-org creation. No list to return to, so the popup opens on the (empty)
// page by default; closing it with X leaves the trigger button to reopen.
export function OrgDialog() {
  return (
    <WizardDialog
      trigger="Create organization"
      title="Create an organization"
      action={createOrganizationAction}
      submitLabel="Create organization"
      defaultOpen
      review={false}
      steps={[
        {
          id: "basics",
          title: "Basics",
          icon: "fa-solid fa-building",
          desc: "Name your company",
          intro: "Your company or hotel chain. You can add one or many hotels under it.",
          content: (
            <Field name="name" label="Organization name" hint="e.g. Adriatic Hotels Group">
              <input name="name" type="text" required minLength={2} maxLength={120} />
            </Field>
          ),
        },
      ]}
    />
  );
}
