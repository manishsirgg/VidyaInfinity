import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { leadSchema } from "@/lib/validations/forms";

export async function POST(request: Request) {
  const payload = leadSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { error } = await admin.data.from("leads").insert({
    name: payload.data.name,
    email: payload.data.email,
    phone: payload.data.phone,
    course_id: payload.data.courseId,
    message: payload.data.message,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: crmError } = await admin.data.from("crm_leads").insert({
    name: payload.data.name,
    email: payload.data.email,
    phone: payload.data.phone,
    source: "course_lead",
    metadata: { course_id: payload.data.courseId, message: payload.data.message },
  });

  if (crmError) {
    return NextResponse.json({ error: crmError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
