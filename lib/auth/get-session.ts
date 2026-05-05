import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/domain";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: Role;
  approval_status: string | null;
  rejection_reason: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type InstituteRow = {
  status: string;
  rejection_reason: string | null;
};

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profileByUserId } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,approval_status,rejection_reason,city,state,country")
    .eq("user_id", user.id)
    .maybeSingle<ProfileRow>();

  const { data: profileById } = profileByUserId
    ? { data: null }
    : await supabase
        .from("profiles")
        .select("id,full_name,email,role,approval_status,rejection_reason,city,state,country")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

  const profile = profileByUserId ?? profileById;

  if (!profile) return null;

  const institute =
    profile.role === "institute"
      ? (
          await supabase
            .from("institutes")
            .select("status,rejection_reason")
            .eq("user_id", user.id)
            .maybeSingle<InstituteRow>()
        ).data ?? null
      : null;

  return { user, profile, institute };
}

function roleStatusRedirect(role: Role) {
  return `/${role}/approval-status`;
}

export async function requireUser(role?: Role, options?: { requireApproved?: boolean }) {
  const result = await getCurrentUserProfile();

  if (!result) redirect("/auth/login");

  if (role && result.profile.role !== role) {
    redirect("/");
  }

  const requireApproved = options?.requireApproved ?? true;

  if (requireApproved && result.profile.approval_status !== "approved") {
    redirect(roleStatusRedirect(result.profile.role));
  }

  if (
    requireApproved &&
    result.profile.role === "institute" &&
    result.institute &&
    result.institute.status !== "approved"
  ) {
    redirect(roleStatusRedirect(result.profile.role));
  }

  return result;
}
