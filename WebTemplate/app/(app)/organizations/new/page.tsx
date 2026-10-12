import { Wizard, Field } from "@/components/ui/Wizard";
import { createOrganizationAction } from "./actions";

export default function NewOrganizationPage() {
  return (
    <div className="pt--40 spico-wizard-page">
      <h4 className="title">Create an organization</h4>
      <Wizard
        action={createOrganizationAction}
        submitLabel="Create organization"
        steps={[
          {
            id: "basics",
            title: "Basics",
            intro: "Your company or hotel chain. You can add one or many hotels under it.",
            content: (
              <Field name="name" label="Organization name" hint="e.g. Adriatic Hotels Group">
                <input name="name" type="text" required minLength={2} maxLength={120} />
              </Field>
            ),
          },
        ]}
      />
    </div>
  );
}
