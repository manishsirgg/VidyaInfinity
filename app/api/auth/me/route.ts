import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: "student" | "institute" | "admin";
  avatar_url?: string | null;
  approval_status: string | null;
};

function getDashboardPath(role: string) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "institute") return "/institute/dashboard";
  return "/student/dashboard";
}

function getApprovalStatusPath(role: string) {
  if (role === "admin") return "/admin/approval-status";
  if (role === "institute") return "/institute/approval-status";
  return "/student/approval-status";
}

function getProfilePath(role: string) {
  if (role === "admin") return "/admin/profile";
  if (role === "institute") return "/institute/profile";
  return "/student/profile";
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ authenticated: false });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,full_name,role,avatar_url,approval_status")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (!profile) {
      return NextResponse.json({ authenticated: false });
    }

    let instituteStatus: string | null = null;
    if (profile.role === "institute") {
      instituteStatus =
        (
          await supabase
            .from("institutes")
            .select("status")
            .eq("user_id", profile.id)
            .maybeSingle<{ status: string }>()
        ).data?.status ?? null;
    }

    const approved =
      profile.approval_status === "approved" &&
      (profile.role !== "institute" || !instituteStatus || instituteStatus === "approved");

    return NextResponse.json({
      authenticated: true,
      user: {
        id: profile.id,
        fullName: profile.full_name ?? user.email ?? "User",
        role: profile.role,
        avatarUrl: profile.avatar_url ?? null,
        approvalStatus: profile.approval_status,
        instituteStatus,
        email: user.email,
      },
      routes: {
        dashboard: approved ? getDashboardPath(profile.role) : getApprovalStatusPath(profile.role),
        profile: getProfilePath(profile.role),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load user profile" },
      { status: 500 }
    );
  }
}
