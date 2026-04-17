import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/domain";

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;

  return { user, profile };
}

export async function requireUser(role?: Role) {
  const result = await getCurrentUserProfile();

  if (!result) redirect("/auth/login");

  if (role && result.profile.role !== role) {
    redirect("/");
  }

  return result;
}
