"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformRole } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";

// Plan catalog changes are superadmin-only — the highest blast radius of any
// write in the system (affects every organization's pricing/limits at once).
// See docs/rbac.md M10.

const createSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Key must be lowercase letters, numbers, underscores"),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().max(500).optional(),
  monthlyPrice: z.coerce.number().min(0),
  maxHotels: z.coerce.number().int().positive().optional(),
  maxUsers: z.coerce.number().int().positive().optional(),
});

export async function createPlanAction(formData: FormData): Promise<void> {
  const user = await requirePlatformRole(["superadmin"]);

  const result = createSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    description: (formData.get("description") as string | null)?.trim() || undefined,
    monthlyPrice: formData.get("monthlyPrice"),
    maxHotels: (formData.get("maxHotels") as string | null) || undefined,
    maxUsers: (formData.get("maxUsers") as string | null) || undefined,
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;
  const features = formData
    .get("features")
    ?.toString()
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean) ?? [];

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("plans")
    .insert({
      key: p.key,
      name: p.name,
      description: p.description || null,
      monthly_price: p.monthlyPrice,
      max_hotels: p.maxHotels ?? null,
      max_users: p.maxUsers ?? null,
      features,
    })
    .select("id")
    .single();

  if (error || !plan) {
    throw new Error(error?.message ?? "Failed to create plan (key may already be in use)");
  }

  await writeAuditLog({
    actorProfileId: user.id,
    action: "plan.created",
    targetType: "plan",
    targetId: plan.id,
    after: { key: p.key, name: p.name, monthly_price: p.monthlyPrice },
  });
}

const statusSchema = z.object({
  planId: z.string().min(1),
  nextStatus: z.enum(["active", "archived"]),
});

export async function setPlanStatusAction(formData: FormData): Promise<void> {
  const user = await requirePlatformRole(["superadmin"]);

  const result = statusSchema.safeParse({
    planId: formData.get("planId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  const p = result.data;

  const supabase = await createClient();
  const { error } = await supabase.from("plans").update({ status: p.nextStatus }).eq("id", p.planId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actorProfileId: user.id,
    action: "plan.status_changed",
    targetType: "plan",
    targetId: p.planId,
    after: { status: p.nextStatus },
  });
}
