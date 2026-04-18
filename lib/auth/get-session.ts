import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/domain";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: Role;
  approval_status: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type InstituteRow = {
  status: string;
};

export async function getCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,approval_status,city,state,country")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (!profile) return null;

  const institute =
    profile.role === "institute"
      ? (
          await supabase
            .from("institutes")
            .select("status")
            .eq("user_id", user.id)
            .maybeSingle<InstituteRow>()
        ).data ?? null
      : null;

  return { user, profile, institute };
}

function approvalRedirectPath(profileStatus: string | null | undefined) {
  if (profileStatus === "rejected") {
    return "/auth/login?status=rejected";
  }
  return "/auth/login?status=pending_approval";
}

export async function requireUser(role?: Role, options?: { requireApproved?: boolean }) {
  const result = await getCurrentUserProfile();

  if (!result) redirect("/auth/login");

  if (role && result.profile.role !== role) {
    redirect("/");
  }

  const requireApproved = options?.requireApproved ?? true;

  if (requireApproved && result.profile.approval_status !== "approved") {
    await (await createClient()).auth.signOut();
    redirect(approvalRedirectPath(result.profile.approval_status));
  }

  if (
    requireApproved &&
    result.profile.role === "institute" &&
    result.institute &&
    result.institute.status !== "approved"
  ) {
    await (await createClient()).auth.signOut();
    redirect(approvalRedirectPath(result.institute.status));
  }

  return result;
}
