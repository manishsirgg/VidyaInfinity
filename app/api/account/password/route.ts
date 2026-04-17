import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const { currentPassword, newPassword, confirmPassword } = await request.json();

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: "currentPassword, newPassword and confirmPassword are required" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "New password and confirm password do not match" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: auth.user.email ?? "",
    password: currentPassword,
  });

  if (verifyError) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
