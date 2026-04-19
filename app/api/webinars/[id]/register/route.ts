import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("student", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data: webinar } = await admin.data
    .from("webinars")
    .select("id,title,webinar_mode,approval_status,status")
    .eq("id", id)
    .maybeSingle<{ id: string; title: string; webinar_mode: string; approval_status: string; status: string }>();

  if (!webinar || webinar.approval_status !== "approved") {
    return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
  }

  if (webinar.status === "cancelled") {
    return NextResponse.json({ error: "This webinar is cancelled" }, { status: 400 });
  }

  if (webinar.webinar_mode !== "free") {
    return NextResponse.json({ error: "Use paid checkout for paid webinar" }, { status: 400 });
  }

  const { error } = await admin.data.from("webinar_registrations").upsert(
    {
      webinar_id: webinar.id,
      student_id: auth.user.id,
      registration_status: "registered",
      payment_status: "not_required",
      access_status: "granted",
      registered_at: new Date().toISOString(),
    },
    { onConflict: "webinar_id,student_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await createAccountNotification({
    userId: auth.user.id,
    type: "resubmission",
    title: "Webinar registration confirmed",
    message: `Your registration for \"${webinar.title}\" is confirmed.`,
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
