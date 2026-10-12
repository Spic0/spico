import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type HotelRow = Database["public"]["Tables"]["hotels"]["Row"];
type AgentRow = Database["public"]["Tables"]["ai_agents"]["Row"];

// RLS scopes every one of these queries to what the caller may see — a
// non-member gets zero rows (and therefore notFound()) rather than a
// distinguishable 403, which avoids confirming the resource even exists.

export async function getOrganizationBySlugOrNotFound(slug: string): Promise<OrganizationRow> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select("*").eq("slug", slug).single();
  if (error || !data) {
    notFound();
  }
  return data;
}

export async function getHotelBySlugOrNotFound(organizationId: string, slug: string): Promise<HotelRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hotels")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("slug", slug)
    .single();
  if (error || !data) {
    notFound();
  }
  return data;
}

export async function listOrganizationsForCurrentUser(): Promise<OrganizationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select("*").order("name");
  if (error) {
    throw new Error(`Failed to list organizations: ${error.message}`);
  }
  return data ?? [];
}

export async function listHotelsForOrganization(organizationId: string): Promise<HotelRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hotels")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) {
    throw new Error(`Failed to list hotels: ${error.message}`);
  }
  return data ?? [];
}

export async function getAgentByIdOrNotFound(hotelId: string, agentId: string): Promise<AgentRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("id", agentId)
    .single();
  if (error || !data) {
    notFound();
  }
  return data;
}
