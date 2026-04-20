import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyWebinarEnrollment } from "@/lib/webinars/enrollment-notifications";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: webinar } = await admin.data
    .from("webinars")
    .select("id,title,webinar_mode,approval_status,status,ends_at,is_public,institute_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      title: string;
      webinar_mode: string;
      approval_status: string;
      status: string;
      ends_at: string | null;
      is_public: boolean | null;
      institute_id: string;
    }>();

  if (!webinar || webinar.approval_status !== "approved" || webinar.is_public !== true) {
    return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
  }

  if (!["scheduled", "live"].includes(webinar.status)) {
    return NextResponse.json({ error: "This webinar is not open for enrollment" }, { status: 400 });
  }

  if (webinar.ends_at && new Date(webinar.ends_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This webinar has already ended" }, { status: 400 });
  }

  if (webinar.webinar_mode !== "free") {
    return NextResponse.json({ error: "Use paid checkout for paid webinar" }, { status: 400 });
  }

  const { data: existingRegistration } = await admin.data
    .from("webinar_registrations")
    .select("id,access_status")
    .eq("webinar_id", webinar.id)
    .eq("student_id", auth.user.id)
    .maybeSingle<{ id: string; access_status: string | null }>();

  const alreadyGranted = existingRegistration?.access_status === "granted";
  if (alreadyGranted) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const { error } = await admin.data.from("webinar_registrations").upsert(
    {
      webinar_id: webinar.id,
      institute_id: webinar.institute_id,
      student_id: auth.user.id,
      registration_status: "registered",
      payment_status: "not_required",
      access_status: "granted",
      registered_at: new Date().toISOString(),
    },
    { onConflict: "webinar_id,student_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!alreadyGranted) {
    await notifyWebinarEnrollment({
      supabase: admin.data,
      webinarId: webinar.id,
      webinarTitle: webinar.title,
      studentId: auth.user.id,
      instituteId: webinar.institute_id,
      mode: "free",
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
