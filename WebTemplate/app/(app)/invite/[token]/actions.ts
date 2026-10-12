"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({ token: z.string().uuid() });

export interface AcceptInvitationState {
  error?: string;
}

// The membership insert + invitation status update happen atomically inside
// accept_invitation() (supabase/migrations/20260803100004) — a SECURITY
// DEFINER function, since memberships_insert's RLS has no path for a
// not-yet-a-member invited user to insert their own row. See that
// migration's header comment for the full reasoning.
export async function acceptInvitationAction(
  _prevState: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const result = schema.safeParse({ token: formData.get("token") });
  if (!result.success) {
    return { error: "Invalid invitation link." };
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: result.data.token }).single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to accept invitation." };
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "invitation.accepted",
    targetType: "invitation",
    organizationId: data.organization_id,
    hotelId: data.hotel_id,
    after: { roleKey: data.role_key },
  });

  redirect(`/o/${data.organization_slug}`);
}
