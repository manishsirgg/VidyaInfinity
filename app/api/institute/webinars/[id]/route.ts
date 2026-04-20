import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { normalizeWebinarMode } from "@/lib/webinars/utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type WebinarUpdatePayload = {
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  webinarMode?: "free" | "paid";
  price?: number;
  currency?: string;
  meetingUrl?: string;
  registrationUrl?: string;
  facultyName?: string;
  facultyBio?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  maxAttendees?: number;
  learningPoints?: string;
  status?: "scheduled" | "live" | "completed" | "cancelled";
};

function parseIso(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isAllowedMeetingUrl(url: string | undefined) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.includes("meet.google.com");
  } catch {
    return false;
  }
}

async function getInstituteId(userId: string) {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient
    .from("institutes")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  return institute?.id ?? null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const instituteId = await getInstituteId(auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data, error } = await dataClient
    .from("webinars")
    .select(
      "id,institute_id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,meeting_url,registration_url,meeting_provider,status,approval_status,rejection_reason,faculty_name,faculty_bio,thumbnail_url,banner_url,max_attendees,learning_points,created_at,updated_at"
    )
    .eq("id", id)
    .eq("institute_id", instituteId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Webinar not found" }, { status: 404 });

  return NextResponse.json({ webinar: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const payload = (await request.json()) as WebinarUpdatePayload;
  const { id } = await params;
  const instituteId = await getInstituteId(auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: existing } = await dataClient
    .from("webinars")
    .select("id,approval_status,starts_at,ends_at,meeting_url")
    .eq("id", id)
    .eq("institute_id", instituteId)
    .maybeSingle<{ id: string; approval_status: string | null; starts_at: string; ends_at: string | null; meeting_url: string | null }>();

  if (!existing) return NextResponse.json({ error: "Webinar not found" }, { status: 404 });

  const mode = normalizeWebinarMode(payload.webinarMode);
  const price = mode === "paid" ? Number(payload.price ?? 0) : 0;
  if (mode === "paid" && price <= 0) {
    return NextResponse.json({ error: "Paid webinar must have price greater than zero" }, { status: 400 });
  }

  const nextStartsAt = typeof payload.startsAt === "string" ? payload.startsAt : existing.starts_at;
  const nextEndsAt = typeof payload.endsAt === "string" ? payload.endsAt : existing.ends_at;
  const startAt = parseIso(nextStartsAt);
  const endAt = parseIso(nextEndsAt ?? undefined);
  if (!startAt || (endAt && endAt.getTime() <= startAt.getTime())) {
    return NextResponse.json({ error: "Invalid date range. End time must be after start time." }, { status: 400 });
  }

  const nextMeetingUrl = typeof payload.meetingUrl === "string" ? payload.meetingUrl.trim() : (existing.meeting_url ?? undefined);
  if (!isAllowedMeetingUrl(nextMeetingUrl)) {
    return NextResponse.json({ error: "Meeting URL must be a valid Google Meet link." }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof payload.title === "string") updateData.title = payload.title.trim();
  if (typeof payload.description === "string") updateData.description = payload.description.trim() || null;
  if (typeof payload.startsAt === "string") updateData.starts_at = payload.startsAt;
  if (typeof payload.endsAt === "string") updateData.ends_at = payload.endsAt || null;
  if (typeof payload.timezone === "string") updateData.timezone = payload.timezone;
  if (typeof payload.webinarMode === "string") updateData.webinar_mode = mode;
  if (typeof payload.price === "number" || payload.webinarMode) updateData.price = price;
  if (typeof payload.currency === "string") updateData.currency = payload.currency;
  if (typeof payload.meetingUrl === "string") updateData.meeting_url = payload.meetingUrl.trim() || null;
  if (typeof payload.registrationUrl === "string") updateData.registration_url = payload.registrationUrl.trim() || null;
  if (typeof payload.facultyName === "string") updateData.faculty_name = payload.facultyName.trim() || null;
  if (typeof payload.facultyBio === "string") updateData.faculty_bio = payload.facultyBio.trim() || null;
  if (typeof payload.thumbnailUrl === "string") updateData.thumbnail_url = payload.thumbnailUrl.trim() || null;
  if (typeof payload.bannerUrl === "string") updateData.banner_url = payload.bannerUrl.trim() || null;
  if (typeof payload.maxAttendees === "number") updateData.max_attendees = payload.maxAttendees;
  if (typeof payload.learningPoints === "string") updateData.learning_points = payload.learningPoints.trim() || null;

  if (payload.status && ["scheduled", "live", "completed", "cancelled"].includes(payload.status)) {
    updateData.status = payload.status;
  }

  if (existing.approval_status === "approved") {
    updateData.approval_status = "pending";
    updateData.rejection_reason = null;
  }

  const { data, error } = await dataClient
    .from("webinars")
    .update(updateData)
    .eq("id", id)
    .eq("institute_id", instituteId)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const instituteId = await getInstituteId(auth.user.id);
  if (!instituteId) return NextResponse.json({ error: "Institute profile not found" }, { status: 404 });

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const { error } = await dataClient
    .from("webinars")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("institute_id", instituteId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
