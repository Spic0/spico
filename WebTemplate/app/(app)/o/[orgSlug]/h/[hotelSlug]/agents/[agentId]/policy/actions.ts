"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { flash } from "@/lib/flash";

const roleKeys = [
  "receptionist",
  "reception_manager",
  "reception_managers_manager",
  "hotel_general_manager",
  "hotel_owner",
] as const;

const schema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  approverRoles: z.array(z.enum(roleKeys)).min(1, "Select at least one approver role"),
  approvalExpiryMinutes: z.coerce.number().int().min(1).max(10080),
  defaultFallback: z.enum(["escalate_to_human", "auto_deny", "send_fallback_message"]),
  allowAutomaticLowRiskReplies: z.boolean(),
  guestVisibleMessagesRequireApproval: z.boolean(),
  reservationRequestsAlwaysRequireApproval: z.boolean(),
});

export async function updateAgentApprovalPolicyAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    approverRoles: formData.getAll("approverRoles"),
    approvalExpiryMinutes: formData.get("approvalExpiryMinutes"),
    defaultFallback: formData.get("defaultFallback"),
    allowAutomaticLowRiskReplies: formData.get("allowAutomaticLowRiskReplies") === "on",
    guestVisibleMessagesRequireApproval: formData.get("guestVisibleMessagesRequireApproval") === "on",
    reservationRequestsAlwaysRequireApproval: formData.get("reservationRequestsAlwaysRequireApproval") === "on",
  });
  if (!result.success) {
    await flash("error", result.error.issues[0]?.message ?? "Invalid input");
    return;
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.manage_policies", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_agent_approval_policies")
    .update({
      approver_roles: parsed.approverRoles,
      approval_expiry_minutes: parsed.approvalExpiryMinutes,
      default_fallback: parsed.defaultFallback,
      allow_automatic_low_risk_replies: parsed.allowAutomaticLowRiskReplies,
      guest_visible_messages_require_approval: parsed.guestVisibleMessagesRequireApproval,
      reservation_requests_always_require_approval: parsed.reservationRequestsAlwaysRequireApproval,
    })
    .eq("agent_id", parsed.agentId);

  if (error) {
    await flash("error", `Failed to save approval policy: ${error.message}`);
    return;
  }

  await flash("success", "Approval policy saved");

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.policy_updated",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: parsed,
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}/policy`);
}
