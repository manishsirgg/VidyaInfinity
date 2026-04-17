import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ error: error?.message ?? "Invalid credentials" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role,approval_status")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile || profile.approval_status !== "approved") {
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Your registration is pending admin approval. Please try again after approval." },
        { status: 403 }
      );
    }

    const redirectPath =
      profile.role === "admin"
        ? "/admin/dashboard"
        : profile.role === "institute"
          ? "/institute/dashboard"
           : "/";

    return NextResponse.json({ ok: true, redirectPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process login" },
      { status: 500 }
    );
  }
}
