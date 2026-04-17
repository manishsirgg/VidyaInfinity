import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { leadSchema } from "@/lib/validations/forms";

export async function POST(request: Request) {
  const payload = leadSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("leads").insert({
    name: payload.data.name,
    email: payload.data.email,
    phone: payload.data.phone,
    course_id: payload.data.courseId,
    message: payload.data.message,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from("crm_leads").insert({
    name: payload.data.name,
    email: payload.data.email,
    phone: payload.data.phone,
    source: "course_lead",
    metadata: { course_id: payload.data.courseId, message: payload.data.message },
  });

  return NextResponse.json({ ok: true });
}
