"use client";

import { WizardDialog, Field } from "@/components/ui/WizardDialog";
import { createGuestAction } from "./actions";

export function GuestDialog({
  orgSlug,
  hotelSlug,
  defaultOpen = false,
  returnTo,
}: {
  orgSlug: string;
  hotelSlug: string;
  defaultOpen?: boolean;
  returnTo?: string;
}) {
  const hidden: Record<string, string> = { orgSlug, hotelSlug };
  if (returnTo) hidden.returnTo = returnTo;
  return (
    <WizardDialog
      trigger="Add guest"
      title="New guest"
      action={createGuestAction}
      hidden={hidden}
      submitLabel="Create guest"
      defaultOpen={defaultOpen}
      steps={[
        {
          id: "name",
          title: "Name",
          icon: "fa-solid fa-user",
          desc: "Who is staying",
          intro: "Who is the guest? Their name is all we need to start a profile.",
          content: (
            <>
              <Field name="firstName" label="First name" hint="e.g. Ana">
                <input name="firstName" required maxLength={120} />
              </Field>
              <Field name="lastName" label="Last name" hint="e.g. Horvat">
                <input name="lastName" required maxLength={120} />
              </Field>
            </>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          icon: "fa-solid fa-envelope",
          desc: "Email & phone",
          intro: "How can the hotel reach them? All optional, but handy for confirmations.",
          content: (
            <>
              <Field name="email" label="Email" hint="e.g. ana@example.com">
                <input name="email" type="email" maxLength={200} />
              </Field>
              <Field name="phone" label="Phone" hint="Include country code, e.g. +385 91 234 5678">
                <input name="phone" maxLength={60} />
              </Field>
              <Field name="countryCode" label="Country" hint="2-letter code, e.g. HR">
                <input name="countryCode" maxLength={2} style={{ textTransform: "uppercase" }} />
              </Field>
            </>
          ),
        },
        {
          id: "extras",
          title: "Extras",
          icon: "fa-solid fa-star",
          desc: "VIP & notes",
          intro: "Anything special? Mark VIPs and leave notes the team should see.",
          content: (
            <>
              <label className="spico-muted spico-wizard-check">
                <input type="checkbox" name="vip" /> VIP guest
              </label>
              <Field name="notes" label="Notes" hint="Allergies, preferences, anything useful">
                <textarea name="notes" rows={3} maxLength={2000} />
              </Field>
            </>
          ),
        },
      ]}
    />
  );
}
