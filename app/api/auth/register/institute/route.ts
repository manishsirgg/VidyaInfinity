import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function POST(request: Request) {
  try {
    const { fullName, email, password, instituteName, city } = await request.json();

    if (!fullName || !email || !password || !instituteName) {
      return NextResponse.json(
        { error: "fullName, email, password, instituteName are required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role: "institute" },
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message ?? "Registration failed" }, { status: 400 });
    }

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: authData.user.id,
      full_name: fullName,
      email,
      role: "institute",
    });

    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const slugBase = toSlug(instituteName);

    const { error: instituteError } = await supabase.from("institutes").insert({
      user_id: authData.user.id,
      name: instituteName,
      slug: `${slugBase}-${authData.user.id.slice(0, 8)}`,
      city: city ?? null,
      approval_status: "pending",
    });

    if (instituteError) {
      return NextResponse.json({ error: instituteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, redirectPath: "/institute/kyc" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to register" },
      { status: 500 }
    );
  }
}
