import { NextResponse } from "next/server";

import { getCurrentUserProfile } from "@/lib/auth/get-session";
import { shouldShowMeetingJoinWindow } from "@/lib/webinars/utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUserProfile();

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: webinar, error } = await dataClient
    .from("webinars")
    .select("id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,meeting_provider,meeting_url,registration_url,status,approval_status,faculty_name,faculty_bio,thumbnail_url,banner_url,max_attendees,learning_points,institute_id,institutes(name)")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!webinar || webinar.approval_status !== "approved") return NextResponse.json({ error: "Webinar not found" }, { status: 404 });

  let hasAccess = false;
  let registration: { access_status?: string | null; payment_status?: string | null } | null = null;

  if (viewer?.user?.id) {
    const { data: row } = await dataClient
      .from("webinar_registrations")
      .select("access_status,payment_status")
      .eq("webinar_id", webinar.id)
      .eq("student_id", viewer.user.id)
      .maybeSingle<{ access_status: string | null; payment_status: string | null }>();
    registration = row ?? null;
    hasAccess = row?.access_status === "granted";
  }

  const isInstituteOwner = Boolean(viewer?.profile.role === "institute" && viewer?.user.id);
  if (isInstituteOwner) {
    const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", viewer!.user.id).maybeSingle<{ id: string }>();
    if (institute?.id === webinar.institute_id) hasAccess = true;
  }

  const meetingVisible = hasAccess && shouldShowMeetingJoinWindow(webinar.starts_at, webinar.ends_at);
  const safeMeetingUrl = meetingVisible ? webinar.meeting_url : null;

  return NextResponse.json({
    webinar: {
      ...webinar,
      meeting_url: safeMeetingUrl,
    },
    eligibility: {
      hasAccess,
      meetingVisible,
      registration,
      viewerRole: viewer?.profile.role ?? null,
      isLoggedIn: Boolean(viewer?.user),
    },
  });
}
