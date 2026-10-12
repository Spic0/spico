"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";
import { CAPABILITY_REGISTRY } from "@/lib/agentCapabilities";

const schema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
});

export async function updateAgentCapabilitiesAction(formData: FormData): Promise<void> {
  const result = schema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.manage_capabilities", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const rows = CAPABILITY_REGISTRY.map((capability) => {
    const enabled = capability.protected ? true : formData.get(`enabled_${capability.key}`) === "on";
    const approvalRaw = formData.get(`approval_${capability.key}`);
    const approvalRequired = approvalRaw === "true" ? true : approvalRaw === "false" ? false : null;
    return {
      agent_id: parsed.agentId,
      capability_key: capability.key,
      enabled,
      approval_required: approvalRequired,
    };
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_agent_capabilities")
    .upsert(rows, { onConflict: "agent_id,capability_key" });

  if (error) {
    throw new Error(`Failed to save capabilities: ${error.message}`);
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.capabilities_updated",
    targetType: "ai_agent",
    targetId: parsed.agentId,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { enabledCount: rows.filter((r) => r.enabled).length },
  });

  revalidatePath(`/o/${organization.slug}/h/${hotel.slug}/agents/${parsed.agentId}/capabilities`);
}
