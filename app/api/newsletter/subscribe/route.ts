import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { newsletterSchema } from "@/lib/validations/forms";

export async function POST(request: Request) {
  const payload = newsletterSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("newsletter_subscribers")
    .upsert({ email: payload.data.email }, { onConflict: "email" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
