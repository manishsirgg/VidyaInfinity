import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/domain";

type ProfileRow = {
  role: Role;
  approval_status: string | null;
};

type InstituteRow = {
  status: string;
};

function deniedForApproval(role: Role, status: string | null | undefined) {
  return NextResponse.json(
    {
      error:
        status === "rejected"
          ? "Your account is rejected. Please update your profile and resubmit."
          : "Your account is pending admin approval.",
      status: status ?? "pending",
      redirectPath: `/${role}/approval-status`,
    },
    { status: 403 }
  );
}

export async function requireApiUser(role?: Role, options?: { requireApproved?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,approval_status")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (!profile) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (role && profile.role !== role) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const requireApproved = options?.requireApproved ?? true;

  if (requireApproved && profile.approval_status !== "approved") {
    return { error: deniedForApproval(profile.role, profile.approval_status) };
  }

  if (requireApproved && profile.role === "institute") {
    const { data: institute } = await supabase
      .from("institutes")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle<InstituteRow>();

    if (institute && institute.status !== "approved") {
      return { error: deniedForApproval(profile.role, institute.status) };
    }
  }

  return { user, profile };
}
