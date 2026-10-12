// Milestone 12: reusable, database-backed readiness-check registry for hotel
// activation. Every check queries real state — never a hardcoded "true".
// Deliberately does NOT include voice or payment/billing checks: a hotel
// must be activatable for PMS/booking-engine testing even before voice is
// configured or a plan is upgraded, per the milestone brief.

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

export interface ReadinessCheck {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ReadinessResult {
  checks: ReadinessCheck[];
  allPassed: boolean;
}

export async function runHotelReadinessChecks(hotel: Hotel, organizationId: string): Promise<ReadinessResult> {
  const supabase = await createClient();

  const [
    { count: activeDepartments },
    { data: businessHoursRows },
    { count: activeRoomTypes },
    { count: activeRooms },
    { count: activeRatePlans },
    { count: hotelScopedOwners },
    { count: orgWideOwners },
  ] = await Promise.all([
    supabase.from("departments").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id).eq("status", "active"),
    supabase.from("hotel_business_hours").select("day_of_week").eq("hotel_id", hotel.id),
    supabase.from("room_types").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id).eq("status", "active"),
    supabase.from("rooms").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id).eq("status", "active"),
    supabase.from("rate_plans").select("id", { count: "exact", head: true }).eq("hotel_id", hotel.id).eq("status", "active"),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("hotel_id", hotel.id)
      .eq("role_key", "hotel_owner")
      .eq("status", "active"),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .is("hotel_id", null)
      .eq("organization_id", organizationId)
      .eq("role_key", "hotel_owner")
      .eq("status", "active"),
  ]);

  const profileComplete = Boolean(
    hotel.address_line1 && hotel.city && hotel.country_code && hotel.contact_email && hotel.contact_phone,
  );

  // Business hours are "configured" once every ISO day-of-week (1-7) has at
  // least one shift row — an explicit is_closed=true row still counts.
  const configuredDays = new Set((businessHoursRows ?? []).map((row) => row.day_of_week));
  const businessHoursConfigured = [1, 2, 3, 4, 5, 6, 7].every((day) => configuredDays.has(day));

  const ownerExists = (hotelScopedOwners ?? 0) > 0 || (orgWideOwners ?? 0) > 0;

  const checks: ReadinessCheck[] = [
    {
      key: "profile_complete",
      label: "Hotel profile has required identity and contact fields",
      passed: profileComplete,
      detail: profileComplete ? undefined : "Add address, city, country code, contact email and phone in Settings.",
    },
    {
      key: "timezone_configured",
      label: "Hotel timezone is set",
      passed: Boolean(hotel.timezone),
    },
    {
      key: "guest_language_configured",
      label: "A default guest language is configured",
      passed: Boolean(hotel.default_guest_language),
      detail: hotel.default_guest_language ? undefined : "Choose a default guest language in Settings.",
    },
    {
      key: "active_department_exists",
      label: "At least one active department exists",
      passed: (activeDepartments ?? 0) > 0,
      detail: (activeDepartments ?? 0) > 0 ? undefined : "Activate at least one department.",
    },
    {
      key: "business_hours_configured",
      label: "Business hours are configured for every day of the week",
      passed: businessHoursConfigured,
      detail: businessHoursConfigured ? undefined : "Set hours (or mark closed) for all 7 days in Business Hours.",
    },
    {
      key: "active_room_type_exists",
      label: "At least one active room type exists",
      passed: (activeRoomTypes ?? 0) > 0,
      detail: (activeRoomTypes ?? 0) > 0 ? undefined : "Create at least one active room type in Rooms & Rates.",
    },
    {
      key: "active_room_exists",
      label: "At least one active room exists",
      passed: (activeRooms ?? 0) > 0,
      detail: (activeRooms ?? 0) > 0 ? undefined : "Create at least one active room in Rooms & Rates.",
    },
    {
      key: "active_rate_plan_exists",
      label: "At least one active rate plan exists",
      passed: (activeRatePlans ?? 0) > 0,
      detail: (activeRatePlans ?? 0) > 0 ? undefined : "Create at least one active rate plan in Rooms & Rates.",
    },
    {
      key: "authorized_owner_exists",
      label: "At least one authorized Hotel Owner membership exists",
      passed: ownerExists,
    },
  ];

  return { checks, allPassed: checks.every((check) => check.passed) };
}
