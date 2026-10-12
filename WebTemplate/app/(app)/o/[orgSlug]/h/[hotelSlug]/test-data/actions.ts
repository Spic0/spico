"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { requireOwnerOrSuperadmin, requireDemoDataSeedingEnabled } from "@/lib/demoData";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  confirm: z.literal("on"),
});

export interface TestDataState {
  error?: string;
  success?: string;
}

// Authorization here is intentionally NOT requirePermission() — see
// lib/demoData.ts. The underlying RPCs (supabase/migrations/20260803100003)
// also re-check the caller's identity themselves; this is defense in depth,
// not the only gate.
export async function seedTestDataAction(_prevState: TestDataState, formData: FormData): Promise<TestDataState> {
  requireDemoDataSeedingEnabled();

  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    confirm: formData.get("confirm"),
  });
  if (!result.success) {
    return { error: "You must check the confirmation box before seeding test data." };
  }
  const parsed = result.data;
  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requireOwnerOrSuperadmin(hotel.id, organization.id);

  const supabase = await createClient();
  const { error } = await supabase.rpc("seed_hotel_test_data", { p_hotel_id: hotel.id });
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "demo_data.seeded",
    targetType: "hotel",
    targetId: hotel.id,
    organizationId: organization.id,
    hotelId: hotel.id,
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/test-data`);
  return { success: "Test data seeded. Every row is labelled \"Test Data — Not a Real Guest or Reservation\"." };
}

export async function removeTestDataAction(_prevState: TestDataState, formData: FormData): Promise<TestDataState> {
  requireDemoDataSeedingEnabled();

  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    confirm: formData.get("confirm"),
  });
  if (!result.success) {
    return { error: "You must check the confirmation box before removing test data." };
  }
  const parsed = result.data;
  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requireOwnerOrSuperadmin(hotel.id, organization.id);

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_hotel_test_data", { p_hotel_id: hotel.id });
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "demo_data.removed",
    targetType: "hotel",
    targetId: hotel.id,
    organizationId: organization.id,
    hotelId: hotel.id,
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/test-data`);
  return { success: "Test data removed. Manually created data was never touched." };
}
