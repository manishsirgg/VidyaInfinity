import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const maybeMessage = "message" in error ? (error as { message?: unknown }).message : undefined;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  return fallback;
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
      return NextResponse.json(
        { error: normalizeErrorMessage(error, "Unable to sign in with the provided credentials") },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle<{ role: "student" | "institute" | "admin" }>();

    if (profileError) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: normalizeErrorMessage(profileError, "Unable to load account profile after login") },
        { status: 500 }
      );
    }

    if (!profile) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "Account profile not found." }, { status: 403 });
    }

    const redirectPath =
      profile.role === "admin" ? "/admin/dashboard" : profile.role === "institute" ? "/institute/dashboard" : "/student/dashboard";

    return NextResponse.json({ ok: true, redirectPath });
  } catch (error) {
    return NextResponse.json(
      { error: normalizeErrorMessage(error, "Unable to process login") },
      { status: 500 }
    );
  }
}
