import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { fullName, email, password } = await request.json();
    if (!fullName || !email || !password) {
      return NextResponse.json({ error: "fullName, email, password are required" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: "student" },
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message ?? "Registration failed" }, { status: 400 });
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: authData.user.id,
      full_name: fullName,
      email,
      role: "student",
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, redirectPath: "/student/dashboard" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to register" },
      { status: 500 }
    );
  }
}
