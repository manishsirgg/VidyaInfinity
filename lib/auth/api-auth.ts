import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/domain";

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
    .maybeSingle();

  if (!profile) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (role && profile.role !== role) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if ((options?.requireApproved ?? true) && profile.approval_status !== "approved") {
    return { error: NextResponse.json({ error: "Your account is pending admin approval" }, { status: 403 }) };
  }

  return { user, profile };
}
