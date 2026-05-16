import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { normalizeWebinarMode } from "@/lib/webinars/utils";
import { createAccountNotification } from "@/lib/notifications/account-notifications";
import { getSuccessfulPaymentStatuses, isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateUniqueWebinarSlug } from "@/lib/webinars/slug";

type CreateWebinarPayload = {
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  webinarMode?: "free" | "paid";
  price?: number;
  currency?: string;
  meetingUrl?: string;
  facultyName?: string;
  facultyBio?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
  maxAttendees?: number;
  learningPoints?: string;
};

function isValidDateRange(startsAt?: string, endsAt?: string) {
  if (!startsAt) return false;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  if (!endsAt) return true;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > start.getTime();
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

export async function GET() {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const instituteId = await getInstituteId(auth.user.id);
  if (!instituteId) return NextResponse.json({ webinars: [] });

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data, error } = await dataClient
    .from("webinars")
    .select(
      "id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,meeting_url,meeting_provider,status,approval_status,rejection_reason,faculty_name,faculty_bio,thumbnail_url,banner_url,max_attendees,learning_points,created_at,updated_at"
    )
    .eq("institute_id", instituteId)
    .order("starts_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const webinarIds = (data ?? []).map((item) => item.id);
  const [{ data: registrationCounts }, { data: paidOrders }] = await Promise.all([
    webinarIds.length > 0
      ? dataClient.from("webinar_registrations").select("webinar_id").in("webinar_id", webinarIds)
      : Promise.resolve({ data: [], error: null }),
    webinarIds.length > 0
      ? dataClient
          .from("webinar_orders")
          .select("webinar_id,payout_amount,payment_status")
          .in("webinar_id", webinarIds)
          .in("payment_status", getSuccessfulPaymentStatuses())
      : Promise.resolve({ data: [], error: null }),
  ]);

  const attendeeMap = new Map<string, number>();
  for (const row of registrationCounts ?? []) {
    const current = attendeeMap.get(row.webinar_id) ?? 0;
    attendeeMap.set(row.webinar_id, current + 1);
  }

  const paidRevenueMap = new Map<string, number>();
  for (const row of (paidOrders ?? []).filter((item) => isSuccessfulPaymentStatus(item.payment_status))) {
    const current = paidRevenueMap.get(row.webinar_id) ?? 0;
    paidRevenueMap.set(row.webinar_id, current + Number(row.payout_amount ?? 0));
  }

  return NextResponse.json({
    webinars: (data ?? []).map((item) => ({
      ...item,
      attendee_count: attendeeMap.get(item.id) ?? 0,
      paid_revenue: paidRevenueMap.get(item.id) ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as CreateWebinarPayload;

  if (!body.title || !body.startsAt) {
    return NextResponse.json({ error: "Title and start date are required." }, { status: 400 });
  }
  if (!isValidDateRange(body.startsAt, body.endsAt)) {
    return NextResponse.json({ error: "Invalid date range. End time must be after start time." }, { status: 400 });
  }
  if (!isAllowedMeetingUrl(body.meetingUrl)) {
    return NextResponse.json({ error: "Meeting URL must be a valid Google Meet link." }, { status: 400 });
  }

  const mode = normalizeWebinarMode(body.webinarMode);
  const price = mode === "paid" ? Number(body.price ?? 0) : 0;
  if (mode === "paid" && price <= 0) {
    return NextResponse.json({ error: "Paid webinar must have price greater than zero" }, { status: 400 });
  }

  const instituteId = await getInstituteId(auth.user.id);
  if (!instituteId) {
    return NextResponse.json({ error: "Institute profile not found." }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  const slug = await generateUniqueWebinarSlug({
    client: dataClient,
    title: body.title,
  });

  const { data, error } = await dataClient
    .from("webinars")
    .insert({
      institute_id: instituteId,
      created_by: auth.user.id,
      title: body.title.trim(),
      slug,
      description: body.description?.trim() ?? null,
      starts_at: body.startsAt,
      ends_at: body.endsAt || null,
      timezone: body.timezone || "Asia/Kolkata",
      webinar_mode: mode,
      price,
      currency: body.currency || "INR",
      meeting_provider: "google_meet",
      meeting_url: body.meetingUrl?.trim() || null,
      faculty_name: body.facultyName?.trim() || null,
      faculty_bio: body.facultyBio?.trim() || null,
      thumbnail_url: body.thumbnailUrl?.trim() || null,
      banner_url: body.bannerUrl?.trim() || null,
      max_attendees: body.maxAttendees ?? null,
      learning_points: body.learningPoints?.trim() || null,
      approval_status: "pending",
      rejection_reason: null,
      status: "scheduled",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: admins } = await dataClient.from("profiles").select("id").eq("role", "admin");
  await Promise.allSettled(
    (admins ?? []).map((adminProfile) =>
      createAccountNotification({
        userId: adminProfile.id,
        type: "resubmission",
        category: "moderation",
        priority: "high",
        title: "Webinar moderation pending",
        message: `A webinar "${(body.title ?? "Untitled webinar").trim()}" is waiting for admin review.`,
        targetUrl: "/admin/webinars",
        actionLabel: "Review webinars",
        entityType: "webinar",
        entityId: data.id,
        dedupeKey: `webinar-pending:${data.id}:admin:${adminProfile.id}`,
      }),
    ),
  );

  return NextResponse.json({ id: data.id }, { status: 201 });
}
