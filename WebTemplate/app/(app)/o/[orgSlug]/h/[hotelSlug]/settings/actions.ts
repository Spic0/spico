"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const hotelTypeValues = ["hotel", "resort", "boutique", "hostel", "apartment", "guesthouse", "other"] as const;

const schema = z
  .object({
    orgSlug: z.string().min(1),
    hotelSlug: z.string().min(1),
    name: z.string().min(2, "Name must be at least 2 characters").max(120),
    description: z.string().max(2000).optional(),
    hotelType: z.enum(hotelTypeValues).optional(),
    starRating: z.coerce.number().int().min(1).max(5).optional(),
    logoUrl: z.string().max(2000).optional(),
    coverImageUrl: z.string().max(2000).optional(),
    addressLine1: z.string().max(200).optional(),
    city: z.string().max(120).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Za-z]{2}$/, "2-letter country code, e.g. US")
      .transform((v) => v.toUpperCase())
      .optional(),
    postalCode: z.string().max(20).optional(),
    timezone: z.string().min(1, "Timezone is required"),
    defaultCurrency: z
      .string()
      .regex(/^[A-Za-z]{3}$/, "3-letter currency code, e.g. USD")
      .transform((v) => v.toUpperCase()),
    defaultLocale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "e.g. en or en-US"),
    contactEmail: z.string().regex(EMAIL_RE, "Enter a valid email").optional(),
    contactPhone: z.string().max(30).optional(),
    websiteUrl: z.string().max(300).optional(),
    checkInTime: z.string().regex(TIME_RE, "Use HH:MM"),
    checkOutTime: z.string().regex(TIME_RE, "Use HH:MM"),
    languages: z.array(z.string().min(1)).min(1, "Select at least one language").max(10, "Up to 10 languages"),
    defaultGuestLanguage: z.string().min(1, "Choose a default guest language"),
  })
  .refine((data) => data.languages.includes(data.defaultGuestLanguage), {
    message: "Default guest language must be one of the selected languages",
    path: ["defaultGuestLanguage"],
  });

export interface HotelSettingsState {
  error?: string;
  success?: boolean;
}

export async function updateHotelSettingsAction(
  _prevState: HotelSettingsState,
  formData: FormData,
): Promise<HotelSettingsState> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    name: formData.get("name"),
    description: emptyToUndefined(formData.get("description")),
    hotelType: emptyToUndefined(formData.get("hotelType")),
    starRating: emptyToUndefined(formData.get("starRating")),
    logoUrl: emptyToUndefined(formData.get("logoUrl")),
    coverImageUrl: emptyToUndefined(formData.get("coverImageUrl")),
    addressLine1: emptyToUndefined(formData.get("addressLine1")),
    city: emptyToUndefined(formData.get("city")),
    countryCode: emptyToUndefined(formData.get("countryCode")),
    postalCode: emptyToUndefined(formData.get("postalCode")),
    timezone: formData.get("timezone"),
    defaultCurrency: formData.get("defaultCurrency"),
    defaultLocale: formData.get("defaultLocale"),
    contactEmail: emptyToUndefined(formData.get("contactEmail")),
    contactPhone: emptyToUndefined(formData.get("contactPhone")),
    websiteUrl: emptyToUndefined(formData.get("websiteUrl")),
    checkInTime: formData.get("checkInTime"),
    checkOutTime: formData.get("checkOutTime"),
    languages: formData.getAll("languages"),
    defaultGuestLanguage: formData.get("defaultGuestLanguage"),
  });

  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Invalid input" };
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("hotel.settings.manage", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("hotels")
    .update({
      name: parsed.name,
      description: parsed.description ?? null,
      hotel_type: parsed.hotelType ?? null,
      star_rating: parsed.starRating ?? null,
      logo_url: parsed.logoUrl ?? null,
      cover_image_url: parsed.coverImageUrl ?? null,
      address_line1: parsed.addressLine1 ?? null,
      city: parsed.city ?? null,
      country_code: parsed.countryCode ?? null,
      postal_code: parsed.postalCode ?? null,
      timezone: parsed.timezone,
      default_currency: parsed.defaultCurrency,
      default_locale: parsed.defaultLocale,
      contact_email: parsed.contactEmail ?? null,
      contact_phone: parsed.contactPhone ?? null,
      website_url: parsed.websiteUrl ?? null,
      check_in_time: parsed.checkInTime,
      check_out_time: parsed.checkOutTime,
      languages: parsed.languages,
      default_guest_language: parsed.defaultGuestLanguage,
    })
    .eq("id", hotel.id)
    .select("id")
    .single();

  if (error || !updated) {
    return { error: error?.message ?? "Not authorized to update this hotel" };
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "hotel.settings_updated",
    targetType: "hotel",
    targetId: hotel.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    before: hotel,
    after: parsed,
  });

  return { success: true };
}
