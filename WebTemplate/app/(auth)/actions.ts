"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const emailSchema = z
  .string()
  .min(3, "Email is required")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email");

export interface AuthState {
  error?: string;
  success?: boolean;
}

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export async function signInAction(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

const signUpSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(120),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signUpAction(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });
  if (error) {
    return { error: error.message };
  }

  redirect("/login?registered=1");
}

const resetSchema = z.object({ email: emailSchema });

export async function resetPasswordAction(_prevState: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.NEXT_PUBLIC_APP_URL}/reset-password/confirm`,
  });
  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
