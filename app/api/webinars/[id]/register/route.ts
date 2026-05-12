import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { recordActivityIfMissing, safeRunCrmAutomation, upsertInstituteCrmContactFromLead } from "@/lib/institute/crm-automation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deliverWebinarAccess } from "@/lib/webinars/access-delivery";
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

  const { data: registration } = await admin.data
    .from("webinar_registrations")
    .select("id")
    .eq("webinar_id", webinar.id)
    .eq("student_id", auth.user.id)
    .maybeSingle<{ id: string }>();

  if (!alreadyGranted && registration?.id) {
    console.info("[api/webinars/register] webinar_registration_created", {
      event: "webinar_registration_created",
      webinar_id: webinar.id,
      student_id: auth.user.id,
      registration_id: registration.id,
    });

    await notifyWebinarEnrollment({
      supabase: admin.data,
      webinarId: webinar.id,
      webinarTitle: webinar.title,
      studentId: auth.user.id,
      instituteId: webinar.institute_id,
      mode: "free",
    }).catch(() => undefined);

    await deliverWebinarAccess({
      supabase: admin.data,
      registrationId: registration.id,
      webinarId: webinar.id,
      studentId: auth.user.id,
    }).catch((deliveryError) => {
      console.error("[api/webinars/register] webinar_delivery_failed_non_blocking", {
        event: "webinar_delivery_failed_non_blocking",
        webinar_id: webinar.id,
        student_id: auth.user.id,
        registration_id: registration.id,
        error: deliveryError instanceof Error ? deliveryError.message : "Unknown error",
      });
    });

    await safeRunCrmAutomation("webinar_registration", async () => {
      const { data: profile } = await admin.data
        .from("profiles")
        .select("full_name,email,phone")
        .eq("id", auth.user.id)
        .maybeSingle<{ full_name: string | null; email: string | null; phone: string | null }>();
      const contact = await upsertInstituteCrmContactFromLead(admin.data, {
        instituteId: webinar.institute_id,
        fullName: profile?.full_name ?? "Student",
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        source: "webinar_registration",
        serviceType: "webinar",
        lifecycleStage: "interested",
        studentId: auth.user.id,
        webinarId: webinar.id,
        metadata: {
          registration_id: registration.id,
          webinar_id: webinar.id,
          payment_status: "not_required",
          access_status: "granted",
          automation_source: "api/webinars/register",
        },
      });
      if (!contact?.id) return;
      await recordActivityIfMissing(admin.data, {
        contactId: contact.id,
        instituteId: webinar.institute_id,
        actorUserId: auth.user.id,
        activityType: "webinar_registered",
        title: "Webinar registered",
        dedupeKey: `webinar_registration:${registration.id}`,
        metadata: {
          registration_id: registration.id,
          webinar_id: webinar.id,
          payment_status: "not_required",
          access_status: "granted",
        },
      });
    });
  }

  return NextResponse.json({ ok: true });
}
