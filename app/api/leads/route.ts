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

  const leadType = payload.data.leadType ?? payload.data.leadTarget ?? "course";
  const source = payload.data.source?.trim() || (leadType === "webinar" ? "webinar_detail_page" : "course_detail_page");
  let course: { id: string; title: string; institute_id: string } | null = null;
  let webinar: { id: string; title: string; institute_id: string } | null = null;

  if (leadType === "webinar") {
    const { data, error: webinarError } = await admin.data
      .from("webinars")
      .select("id,title,institute_id")
      .eq("id", payload.data.webinarId)
      .maybeSingle<{ id: string; title: string; institute_id: string }>();
    if (webinarError) {
      return NextResponse.json({ error: "Unable to validate the selected webinar right now. Please try again." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json({ error: "The selected webinar could not be found." }, { status: 404 });
    }
    webinar = data;
  } else {
    const { data, error: courseError } = await admin.data
      .from("courses")
      .select("id,title,institute_id")
      .eq("id", payload.data.courseId)
      .maybeSingle<{ id: string; title: string; institute_id: string }>();
    if (courseError) {
      return NextResponse.json({ error: "Unable to validate the selected course right now. Please try again." }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json({ error: "The selected course could not be found." }, { status: 404 });
    }
    course = data;
  }

  const resolvedInstituteId = course?.institute_id ?? webinar?.institute_id ?? null;
  if (!resolvedInstituteId) {
    return NextResponse.json({ error: "Unable to resolve institute for this inquiry." }, { status: 400 });
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
    lead_type: leadType,
    lead_target: leadType,
    contact_preference: payload.data.contactPreference,
    course_id: leadType === "course" ? payload.data.courseId ?? null : null,
    webinar_id: leadType === "webinar" ? payload.data.webinarId ?? null : null,
    institute_id: resolvedInstituteId,
    source,
    metadata: {
      ...(payload.data.metadata ?? {}),
      contact_preference: payload.data.contactPreference,
      provided_institute_id: payload.data.instituteId ?? null,
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
      course_id: payload.data.courseId ?? null,
      webinar_id: payload.data.webinarId ?? null,
      institute_id: resolvedInstituteId,
      lead_type: leadType,
      source,
      message: payload.data.message,
      contact_preference: payload.data.contactPreference,
      provided_institute_id: payload.data.instituteId ?? null,
    },
  });

  if (crmError) {
    console.error("Course lead CRM sync failed", {
      error: crmError.message,
      courseId: payload.data.courseId,
      instituteId: resolvedInstituteId,
      source,
    });
  }

  const { data: admins } = await admin.data.from("profiles").select("id").eq("role", "admin");

  const targetInstituteId = resolvedInstituteId;
  const targetId = course?.id ?? webinar?.id ?? null;
  const targetTitle = course?.title ?? webinar?.title ?? "listing";
  const targetType = leadType === "webinar" ? "webinar" : "course";
  if (targetInstituteId && targetId) {
    const { data: institute } = await admin.data.from("institutes").select("user_id").eq("id", targetInstituteId).maybeSingle<{ user_id: string }>();

    await Promise.allSettled([
      ...(institute?.user_id
        ? [
            createAccountNotification({
              userId: institute.user_id,
              type: "lead",
              category: "crm_lead",
              priority: "high",
              title: `New ${targetType} lead received`,
              message: `${payload.data.fullName} submitted a new lead for ${targetTitle}.`,
              targetUrl: "/institute/leads",
              actionLabel: "View leads",
              entityType: targetType,
              entityId: targetId,
              dedupeKey: `${targetType}-lead:${targetId}:${payload.data.email ?? payload.data.phone}`,
              metadata: { targetId, targetType, email: payload.data.email ?? null, phone: payload.data.phone ?? null },
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
          message: `A new lead was captured for ${targetTitle}.`,
          targetUrl: "/admin/crm",
          actionLabel: "Open CRM",
          entityType: targetType,
          entityId: targetId,
          dedupeKey: `${targetType}-lead-admin:${targetId}:${payload.data.email ?? payload.data.phone}:${row.id}`,
        }),
      ),
    ]);
  }

  const integrations =
    leadType === "course" && payload.data.courseId
      ? await triggerCourseLeadAutomations({
          name: payload.data.fullName,
          email: payload.data.email,
          phone: payload.data.phone,
          courseId: payload.data.courseId,
          message: payload.data.message,
          contactPreference: payload.data.contactPreference,
        })
      : [];

  const failedIntegrations = integrations.filter((integration) => !integration.ok);
  if (failedIntegrations.length > 0) {
    console.error("Course lead automation sync failed", {
      courseId: payload.data.courseId,
      webinarId: payload.data.webinarId,
      source,
      failures: failedIntegrations,
    });
  }

  return NextResponse.json({ ok: true });
}
