import { NextResponse } from "next/server";

import { triggerCourseLeadAutomations } from "@/lib/integrations/course-leads";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { leadSchema } from "@/lib/validations/forms";

export async function POST(request: Request) {
  const payload = leadSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const source = payload.data.source?.trim() || "course_detail_page";
  const { data: course, error: courseError } = await admin.data
    .from("courses")
    .select("id,title,institute_id")
    .eq("id", payload.data.courseId)
    .maybeSingle<{ id: string; title: string; institute_id: string }>();

  if (courseError) {
    return NextResponse.json({ error: "Unable to validate the selected course right now. Please try again." }, { status: 503 });
  }

  if (!course) {
    return NextResponse.json({ error: "The selected course could not be found." }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let studentId: string | null = null;

  if (user?.id) {
    const { data: profile } = await admin.data.from("profiles").select("id,role").eq("id", user.id).maybeSingle<{ id: string; role: string | null }>();
    if (profile?.role === "student") {
      studentId = user.id;
    }
  }

  const leadInsertPayload = {
    student_id: studentId,
    name: payload.data.fullName,
    full_name: payload.data.fullName,
    email: payload.data.email?.trim() || null,
    phone: payload.data.phone?.trim() || null,
    message: payload.data.message?.trim() || null,
    lead_target: payload.data.leadTarget,
    course_id: payload.data.courseId,
    institute_id: payload.data.instituteId ?? course.institute_id,
    source,
    metadata: {
      ...(payload.data.metadata ?? {}),
      contact_preference: payload.data.contactPreference,
    },
  };

  const { error } = await admin.data.from("leads").insert(leadInsertPayload);

  if (error) {
    return NextResponse.json({ error: "Unable to submit your inquiry right now. Please try again shortly." }, { status: 500 });
  }

  const { error: crmError } = await admin.data.from("crm_leads").insert({
    name: payload.data.fullName,
    email: payload.data.email?.trim() || null,
    phone: payload.data.phone?.trim() || null,
    source: "course_lead",
    metadata: {
      course_id: payload.data.courseId,
      institute_id: payload.data.instituteId ?? course.institute_id,
      lead_target: payload.data.leadTarget,
      source,
      message: payload.data.message,
      contact_preference: payload.data.contactPreference,
    },
  });

  if (crmError) {
    return NextResponse.json({ error: "Your inquiry was captured, but CRM sync failed. Please contact support if needed." }, { status: 500 });
  }

  const { data: admins } = await admin.data.from("profiles").select("id").eq("role", "admin");

  if (course) {
    const { data: institute } = await admin.data.from("institutes").select("user_id").eq("id", course.institute_id).maybeSingle<{ user_id: string }>();

    await Promise.allSettled([
      ...(institute?.user_id
        ? [
            createAccountNotification({
              userId: institute.user_id,
              type: "lead",
              category: "crm_lead",
              priority: "high",
              title: "New course lead received",
              message: `${payload.data.fullName} submitted a new lead for ${course.title}.`,
              targetUrl: "/institute/leads",
              actionLabel: "View leads",
              entityType: "course",
              entityId: course.id,
              dedupeKey: `course-lead:${course.id}:${payload.data.email ?? payload.data.phone}`,
              metadata: { courseId: course.id, email: payload.data.email ?? null, phone: payload.data.phone ?? null },
            }),
          ]
        : []),
      ...(admins ?? []).map((row) =>
        createAccountNotification({
          userId: row.id,
          type: "lead",
          category: "crm_lead",
          priority: "normal",
          title: "New platform lead",
          message: `A new lead was captured for ${course.title}.`,
          targetUrl: "/admin/crm",
          actionLabel: "Open CRM",
          entityType: "course",
          entityId: course.id,
          dedupeKey: `course-lead-admin:${course.id}:${payload.data.email ?? payload.data.phone}:${row.id}`,
        }),
      ),
    ]);
  }

  const integrations = await triggerCourseLeadAutomations({
    name: payload.data.fullName,
    email: payload.data.email,
    phone: payload.data.phone,
    courseId: payload.data.courseId,
    message: payload.data.message,
    contactPreference: payload.data.contactPreference,
  });

  return NextResponse.json({ ok: true, integrations });
}
