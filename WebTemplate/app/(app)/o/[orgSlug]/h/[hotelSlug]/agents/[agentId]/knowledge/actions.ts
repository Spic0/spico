"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/authz";
import { getOrganizationBySlugOrNotFound, getHotelBySlugOrNotFound, getAgentByIdOrNotFound } from "@/lib/data";
import { writeAuditLog } from "@/lib/audit";

const toggleSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

export async function toggleAgentKnowledgeAction(formData: FormData): Promise<void> {
  const result = toggleSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    enabled: formData.get("enabled"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  // Toggling the master switch writes to ai_agents, gated by ai_agents.update
  // (its RLS admits update/activate/archive). Every role granted
  // ai_agents.manage_knowledge is also granted ai_agents.update.
  const user = await requirePermission("ai_agents.update", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const nextEnabled = parsed.enabled === "true";
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("ai_agents")
    .update({ knowledge_base_enabled: nextEnabled, updated_by: user.id })
    .eq("id", agent.id)
    .select("id")
    .single();

  if (error || !updated) {
    throw new Error(error?.message ?? "Failed to update knowledge base setting");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.knowledge_toggled",
    targetType: "ai_agent",
    targetId: agent.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { knowledge_base_enabled: nextEnabled },
  });
}

const addSchema = z
  .object({
    orgSlug: z.string().min(1),
    hotelSlug: z.string().min(1),
    agentId: z.string().min(1),
    sourceKind: z.enum(["all", "category", "document", "article"]),
    categoryId: z.string().optional(),
    documentId: z.string().optional(),
    articleId: z.string().optional(),
  })
  .refine((v) => v.sourceKind !== "category" || !!v.categoryId, { message: "Choose a category" })
  .refine((v) => v.sourceKind !== "document" || !!v.documentId, { message: "Choose a document" })
  .refine((v) => v.sourceKind !== "article" || !!v.articleId, { message: "Choose an article" });

async function assertBelongsToHotel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "kb_categories" | "kb_documents" | "kb_articles",
  id: string,
  hotelId: string,
): Promise<void> {
  const { data } = await supabase.from(table).select("id").eq("id", id).eq("hotel_id", hotelId).single();
  if (!data) {
    throw new Error("Selected knowledge source does not belong to this hotel");
  }
}

export async function addAgentKnowledgeSourceAction(formData: FormData): Promise<void> {
  const result = addSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    sourceKind: formData.get("sourceKind"),
    categoryId: (formData.get("categoryId") as string | null) || undefined,
    documentId: (formData.get("documentId") as string | null) || undefined,
    articleId: (formData.get("articleId") as string | null) || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.manage_knowledge", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();

  let categoryId: string | null = null;
  let documentId: string | null = null;
  let articleId: string | null = null;
  if (parsed.sourceKind === "category") {
    await assertBelongsToHotel(supabase, "kb_categories", parsed.categoryId as string, hotel.id);
    categoryId = parsed.categoryId as string;
  } else if (parsed.sourceKind === "document") {
    await assertBelongsToHotel(supabase, "kb_documents", parsed.documentId as string, hotel.id);
    documentId = parsed.documentId as string;
  } else if (parsed.sourceKind === "article") {
    await assertBelongsToHotel(supabase, "kb_articles", parsed.articleId as string, hotel.id);
    articleId = parsed.articleId as string;
  }

  // organization_id/hotel_id are derived from agent_id by the shared trigger.
  const { data: inserted, error } = await supabase
    .from("ai_agent_knowledge_sources")
    .insert({
      agent_id: agent.id,
      source_kind: parsed.sourceKind,
      category_id: categoryId,
      document_id: documentId,
      article_id: articleId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Failed to add knowledge source (it may already be assigned)");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.knowledge_source_added",
    targetType: "ai_agent_knowledge_source",
    targetId: inserted.id,
    organizationId: organization.id,
    hotelId: hotel.id,
    after: { agent_id: agent.id, source_kind: parsed.sourceKind, category_id: categoryId, document_id: documentId, article_id: articleId },
  });
}

const removeSchema = z.object({
  orgSlug: z.string().min(1),
  hotelSlug: z.string().min(1),
  agentId: z.string().min(1),
  sourceId: z.string().min(1),
});

export async function removeAgentKnowledgeSourceAction(formData: FormData): Promise<void> {
  const result = removeSchema.safeParse({
    orgSlug: formData.get("orgSlug"),
    hotelSlug: formData.get("hotelSlug"),
    agentId: formData.get("agentId"),
    sourceId: formData.get("sourceId"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const parsed = result.data;

  const organization = await getOrganizationBySlugOrNotFound(parsed.orgSlug);
  const hotel = await getHotelBySlugOrNotFound(organization.id, parsed.hotelSlug);
  const agent = await getAgentByIdOrNotFound(hotel.id, parsed.agentId);
  const user = await requirePermission("ai_agents.manage_knowledge", {
    hotelId: hotel.id,
    organizationId: organization.id,
  });

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("ai_agent_knowledge_sources")
    .delete()
    .eq("id", parsed.sourceId)
    .eq("agent_id", agent.id)
    .select("id")
    .single();

  if (error || !deleted) {
    throw new Error(error?.message ?? "Failed to remove knowledge source");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "ai_agent.knowledge_source_removed",
    targetType: "ai_agent_knowledge_source",
    targetId: parsed.sourceId,
    organizationId: organization.id,
    hotelId: hotel.id,
  });
}
