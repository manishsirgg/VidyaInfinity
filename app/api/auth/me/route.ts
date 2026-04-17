import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: "student" | "institute" | "admin";
  avatar_url?: string | null;
  approval_status: string;
};

function getDashboardPath(role: string) {
  if (role === "admin") return "/admin/dashboard";
  if (role === "institute") return "/institute/dashboard";
  return "/student/dashboard";
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

    const getProfileById = async () => {
      const withAvatar = await supabase
        .from("profiles")
        .select("id,full_name,role,avatar_url,approval_status")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (!withAvatar.error) return withAvatar;

      const withoutAvatar = await supabase
        .from("profiles")
        .select("id,full_name,role,approval_status")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      return withoutAvatar;
    };

    let { data: profile } = await getProfileById();

    if (!profile && user.email) {
      const { data: byEmail } = await supabase
        .from("profiles")
        .select("id,full_name,role,approval_status")
        .ilike("email", user.email)
        .maybeSingle<ProfileRow>();

      profile = byEmail;
    }

    if (!profile) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: profile.id,
        fullName: profile.full_name ?? user.email ?? "User",
        role: profile.role,
        avatarUrl: profile.avatar_url ?? null,
        approvalStatus: profile.approval_status,
        email: user.email,
      },
      routes: {
        dashboard: getDashboardPath(profile.role),
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
