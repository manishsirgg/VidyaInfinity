import { NextResponse } from "next/server";

import { triggerCourseLeadAutomations } from "@/lib/integrations/course-leads";
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
    email: payload.data.email?.trim() || null,
    phone: payload.data.phone?.trim() || null,
    course_id: payload.data.courseId,
    message: payload.data.message,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: crmError } = await admin.data.from("crm_leads").insert({
    name: payload.data.name,
    email: payload.data.email?.trim() || null,
    phone: payload.data.phone?.trim() || null,
    source: "course_lead",
    metadata: {
      course_id: payload.data.courseId,
      message: payload.data.message,
      contact_preference: payload.data.contactPreference,
    },
  });

  if (crmError) {
    return NextResponse.json({ error: crmError.message }, { status: 500 });
  }

  const integrations = await triggerCourseLeadAutomations(payload.data);

  return NextResponse.json({ ok: true, integrations });
}
