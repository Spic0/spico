"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { runHotelReadinessChecks } from "@/lib/hotelReadiness";

const schema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
});

export interface ActivateHotelState {
  error?: string;
  success?: boolean;
}

// Re-runs every readiness check server-side before activating — never
// trusts a client-side "all passed" signal. See lib/hotelReadiness.ts.
export async function activateHotelAction(
  _prevState: ActivateHotelState,
  formData: FormData,
): Promise<ActivateHotelState> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
  });
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Invalid input" };
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const user = await requirePermission("hotel.activate", { hotelId: hotel.id, organizationId: organization.id });

  if (hotel.status === "active") {
    return { error: "This hotel is already active." };
  }

  const readiness = await runHotelReadinessChecks(hotel, organization.id);
  if (!readiness.allPassed) {
    const firstFailing = readiness.checks.find((check) => !check.passed);
    return { error: `Not ready to activate — "${firstFailing?.label ?? "a readiness check"}" has not been met yet.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("hotels").update({ status: "active" }).eq("id", hotel.id);
  if (error) {
    return { error: error.message };
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "hotel.activated",
    targetType: "hotel",
    targetId: hotel.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    before: { status: hotel.status },
    after: { status: "active" },
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}`);
  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/onboarding`);
  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/settings`);
  return { success: true };
}
