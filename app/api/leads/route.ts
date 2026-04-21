import { NextResponse } from "next/server";

import { triggerCourseLeadAutomations } from "@/lib/integrations/course-leads";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
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

  const [{ data: course }, { data: admins }] = await Promise.all([
    admin.data
      .from("courses")
      .select("id,title,institute_id")
      .eq("id", payload.data.courseId)
      .maybeSingle<{ id: string; title: string; institute_id: string }>(),
    admin.data.from("profiles").select("id").eq("role", "admin"),
  ]);

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
              message: `${payload.data.name} submitted a new lead for ${course.title}.`,
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

  const integrations = await triggerCourseLeadAutomations(payload.data);

  return NextResponse.json({ ok: true, integrations });
}
