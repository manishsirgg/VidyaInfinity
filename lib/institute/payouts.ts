import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export async function getInstituteIdForUser(userId: string) {
  const admin = getSupabaseAdmin();
  if (admin.ok) {
    const { data, error } = await admin.data.from("institutes").select("id").eq("user_id", userId).maybeSingle<{ id: string }>();
    if (error) return { instituteId: null, error: error.message };
    return { instituteId: data?.id ?? null, error: null };
  }

  return { instituteId: null, error: admin.error };
}

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function runRpcWithFallback<T>(
  fn: string,
  argVariants: Array<Record<string, unknown>>,
): Promise<{ data: T | null; error: string | null }> {
  const admin = getSupabaseAdmin();
  if (!admin.ok) return { data: null, error: admin.error };

  let lastError: string | null = null;

  for (const args of argVariants) {
    const { data, error } = await admin.data.rpc(fn, args);
    if (!error) {
      return { data: (data as T) ?? null, error: null };
    }
    lastError = error.message;
  }

  return { data: null, error: lastError ?? `Unable to execute ${fn}` };
}

export function parseAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

export function resolveUserId(user: User) {
  return user.id;
}
