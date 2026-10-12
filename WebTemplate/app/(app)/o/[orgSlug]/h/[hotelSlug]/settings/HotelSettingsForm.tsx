"use client";

import { useActionState, useState } from "react";
import { updateHotelSettingsAction, type HotelSettingsState } from "./actions";
import { SUPPORTED_GUEST_LANGUAGES } from "@/lib/languages";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Database } from "@/lib/supabase/types";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

const initialState: HotelSettingsState = {};

export function HotelSettingsForm({
  hotel,
  orgSlug,
  hotelSlug,
}: {
  hotel: Hotel;
  orgSlug: string;
  hotelSlug: string;
}) {
  const [state, formAction, pending] = useActionState(updateHotelSettingsAction, initialState);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(hotel.languages);

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((current) =>
      current.includes(code)
        ? current.filter((c) => c !== code)
        : current.length >= 10
          ? current
          : [...current, code],
    );
  };

  return (
    <form action={formAction} className="spico-settings-form">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="hotelSlug" value={hotelSlug} />

      {state.error && <p className="spico-form-error">{state.error}</p>}
      {state.success && <p className="spico-form-success">Hotel settings saved.</p>}

      <h5 className="title mt--20">Profile</h5>
      <div className="input-wrapper">
        <label htmlFor="name">Hotel name</label>
        <input id="name" name="name" type="text" defaultValue={hotel.name} required />
      </div>
      <div className="input-wrapper">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" defaultValue={hotel.description ?? ""} rows={4} />
      </div>
      <div className="input-wrapper">
        <label htmlFor="hotelType">Hotel type</label>
        <select id="hotelType" name="hotelType" defaultValue={hotel.hotel_type ?? ""}>
          <option value="">Not set</option>
          <option value="hotel">Hotel</option>
          <option value="resort">Resort</option>
          <option value="boutique">Boutique</option>
          <option value="hostel">Hostel</option>
          <option value="apartment">Apartment</option>
          <option value="guesthouse">Guesthouse</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="input-wrapper">
        <label htmlFor="starRating">Star rating</label>
        <select id="starRating" name="starRating" defaultValue={hotel.star_rating ?? ""}>
          <option value="">Not rated</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} star{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="input-wrapper">
        <label htmlFor="logoUrl">Logo URL</label>
        <input id="logoUrl" name="logoUrl" type="text" defaultValue={hotel.logo_url ?? ""} />
      </div>
      <div className="input-wrapper">
        <label htmlFor="coverImageUrl">Cover image URL</label>
        <input id="coverImageUrl" name="coverImageUrl" type="text" defaultValue={hotel.cover_image_url ?? ""} />
      </div>

      <h5 className="title mt--30">Location</h5>
      <div className="input-wrapper">
        <label htmlFor="addressLine1">Address</label>
        <input id="addressLine1" name="addressLine1" type="text" defaultValue={hotel.address_line1 ?? ""} />
      </div>
      <div className="input-wrapper">
        <label htmlFor="city">City</label>
        <input id="city" name="city" type="text" defaultValue={hotel.city ?? ""} />
      </div>
      <div className="input-wrapper">
        <label htmlFor="countryCode">Country code</label>
        <input
          id="countryCode"
          name="countryCode"
          type="text"
          maxLength={2}
          placeholder="e.g. US"
          defaultValue={hotel.country_code ?? ""}
        />
      </div>
      <div className="input-wrapper">
        <label htmlFor="postalCode">Postal code</label>
        <input id="postalCode" name="postalCode" type="text" defaultValue={hotel.postal_code ?? ""} />
      </div>
      <div className="input-wrapper">
        <label htmlFor="timezone">Timezone (IANA)</label>
        <input
          id="timezone"
          name="timezone"
          type="text"
          placeholder="e.g. Europe/Zagreb"
          defaultValue={hotel.timezone}
          required
        />
      </div>

      <h5 className="title mt--30">Operations</h5>
      <div className="input-wrapper">
        <label htmlFor="defaultCurrency">Default currency</label>
        <input
          id="defaultCurrency"
          name="defaultCurrency"
          type="text"
          maxLength={3}
          defaultValue={hotel.default_currency}
          required
        />
      </div>
      <div className="input-wrapper">
        <label htmlFor="defaultLocale">Default locale</label>
        <input
          id="defaultLocale"
          name="defaultLocale"
          type="text"
          placeholder="e.g. en or en-US"
          defaultValue={hotel.default_locale}
          required
        />
      </div>
      <div className="input-wrapper">
        <label htmlFor="checkInTime">Check-in time</label>
        <input
          id="checkInTime"
          name="checkInTime"
          type="time"
          defaultValue={hotel.check_in_time.slice(0, 5)}
          required
        />
      </div>
      <div className="input-wrapper">
        <label htmlFor="checkOutTime">Check-out time</label>
        <input
          id="checkOutTime"
          name="checkOutTime"
          type="time"
          defaultValue={hotel.check_out_time.slice(0, 5)}
          required
        />
      </div>
      <div className="input-wrapper">
        <label>Hotel status</label>
        <p>
          <StatusChip status={hotel.status} />{" "}
          <span className="spico-muted">
            Status is managed on the{" "}
            <a href={`/o/${orgSlug}/h/${hotelSlug}/onboarding`}>Onboarding</a> page, not here — a hotel activates
            only once its readiness checklist passes.
          </span>
        </p>
      </div>

      <h5 className="title mt--30">Contact</h5>
      <div className="input-wrapper">
        <label htmlFor="contactEmail">Contact email</label>
        <input id="contactEmail" name="contactEmail" type="text" defaultValue={hotel.contact_email ?? ""} />
      </div>
      <div className="input-wrapper">
        <label htmlFor="contactPhone">Contact phone</label>
        <input id="contactPhone" name="contactPhone" type="text" defaultValue={hotel.contact_phone ?? ""} />
      </div>
      <div className="input-wrapper">
        <label htmlFor="websiteUrl">Website URL</label>
        <input id="websiteUrl" name="websiteUrl" type="text" defaultValue={hotel.website_url ?? ""} />
      </div>

      <h5 className="title mt--30">Guest languages</h5>
      <p className="spico-muted">Select up to 10 languages this hotel supports for guest communication.</p>
      <div className="spico-checkbox-grid">
        {SUPPORTED_GUEST_LANGUAGES.map((lang) => (
          <label key={lang.code} className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              name="languages"
              value={lang.code}
              checked={selectedLanguages.includes(lang.code)}
              onChange={() => toggleLanguage(lang.code)}
            />
            <span className="form-check-label">{lang.label}</span>
          </label>
        ))}
      </div>

      <div className="input-wrapper mt--20">
        <label htmlFor="defaultGuestLanguage">Default guest communication language</label>
        <select
          id="defaultGuestLanguage"
          name="defaultGuestLanguage"
          defaultValue={hotel.default_guest_language ?? ""}
          required
        >
          <option value="" disabled>
            Choose a default
          </option>
          {selectedLanguages.map((code) => (
            <option key={code} value={code}>
              {SUPPORTED_GUEST_LANGUAGES.find((l) => l.code === code)?.label ?? code}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="rts-btn btn-primary mt--20" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
