import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function approvalErrorMessage(status: string | null | undefined) {
  if (status === "rejected") {
    return "Your registration was rejected. Please contact support or re-register with valid documents.";
  }
  return "Your registration is pending admin approval. Please try again after approval.";
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "");

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (!emailPattern.test(normalizedEmail)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Invalid credentials" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role,approval_status")
      .eq("id", data.user.id)
      .maybeSingle<{ role: "student" | "institute" | "admin"; approval_status: string | null }>();

    if (!profile) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "Account profile not found." }, { status: 403 });
    }

    if (profile.approval_status !== "approved") {
      await supabase.auth.signOut();
      return NextResponse.json({ error: approvalErrorMessage(profile.approval_status) }, { status: 403 });
    }

    if (profile.role === "institute") {
      const { data: institute } = await supabase
        .from("institutes")
        .select("status")
        .eq("user_id", data.user.id)
        .maybeSingle<{ status: string }>();

      if (institute && institute.status !== "approved") {
        await supabase.auth.signOut();
        return NextResponse.json({ error: approvalErrorMessage(institute.status) }, { status: 403 });
      }
    }

    const redirectPath =
      profile.role === "admin" ? "/admin/dashboard" : profile.role === "institute" ? "/institute/dashboard" : "/student/dashboard";

    return NextResponse.json({ ok: true, redirectPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process login" },
      { status: 500 }
    );
  }
}
