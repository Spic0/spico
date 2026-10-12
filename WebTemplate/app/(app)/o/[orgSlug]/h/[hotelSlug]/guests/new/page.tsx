import Link from "next/link";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requirePermission } from "@/lib/authz";
import { Wizard, Field } from "@/components/ui/Wizard";
import { createGuestAction } from "../actions";

export default async function NewGuestPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; hotelSlug: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { orgSlug, hotelSlug } = await params;
  const { returnTo } = await searchParams;
  const organization = await getOrganizationBySlugOrNotFound(orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, hotelSlug);
  await requirePermission("guests.manage", { hotelId: hotel.id, organizationId: organization.id });

  const base = `/o/${orgSlug}/h/${hotelSlug}/guests`;
  const hidden: Record<string, string> = { orgSlug, hotelSlug };
  if (returnTo && returnTo.startsWith("/o/")) hidden.returnTo = returnTo;

  return (
    <div className="pt--40">
      <Link href={base} className="spico-muted">
        ← Back to guests
      </Link>
      <h4 className="title mt--10">New guest</h4>
      <Wizard
        action={createGuestAction}
        hidden={hidden}
        submitLabel="Create guest"
        steps={[
          {
            id: "name",
            title: "Name",
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
    </div>
  );
}
