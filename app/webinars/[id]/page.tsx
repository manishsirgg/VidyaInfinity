import { notFound } from "next/navigation";

import { WebinarActionCard } from "@/components/webinars/webinar-action-card";
import { getCurrentUserProfile } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { expireWebinarFeaturedSubscriptionsSafe } from "@/lib/webinar-featured";
import { shouldShowMeetingJoinWindow, toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";

type WebinarRecord = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  webinar_mode: "free" | "paid";
  price: number | null;
  currency: string | null;
  meeting_url: string | null;
  meeting_provider: string | null;
  faculty_name: string | null;
  faculty_bio: string | null;
  banner_url: string | null;
  thumbnail_url: string | null;
  approval_status: string;
  status: "scheduled" | "live" | "completed" | "cancelled";
  is_public: boolean | null;
  max_attendees: number | null;
  institutes: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function instituteName(value: WebinarRecord["institutes"]) {
  if (Array.isArray(value)) return value[0]?.name ?? "Institute";
  return value?.name ?? "Institute";
}

export default async function WebinarDetailPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getCurrentUserProfile();
  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;
  if (admin.ok) {
    await expireWebinarFeaturedSubscriptionsSafe(admin.data);
  }

  const { data: webinar } = await dataClient
    .from("webinars")
    .select("id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,meeting_url,meeting_provider,faculty_name,faculty_bio,banner_url,thumbnail_url,approval_status,status,is_public,max_attendees,institutes(name)")
    .eq("id", id)
    .eq("approval_status", "approved")
    .eq("is_public", true)
    .maybeSingle<WebinarRecord>();

  if (!webinar) notFound();

  let hasAccess = false;
  let activeAccessEndAt: string | null = null;
  let isSaved = false;
  if (viewer?.user.id) {
    const [{ data: registration }, { data: paidOrder }, { data: savedWebinar }] = await Promise.all([
      dataClient
      .from("webinar_registrations")
      .select("access_status,access_end_at")
      .eq("webinar_id", id)
      .eq("student_id", viewer.user.id)
      .in("access_status", ["granted"])
      .or("access_end_at.is.null,access_end_at.gte.now()")
      .maybeSingle<{ access_status: string; access_end_at: string | null }>(),
      dataClient
        .from("webinar_orders")
        .select("access_status,payment_status,order_status")
        .eq("webinar_id", id)
        .eq("student_id", viewer.user.id)
        .eq("payment_status", "paid")
        .eq("order_status", "confirmed")
        .maybeSingle<{ access_status: string | null; payment_status: string; order_status: string }>(),
      dataClient
        .from("student_saved_webinars")
        .select("id")
        .eq("student_id", viewer.user.id)
        .eq("webinar_id", id)
        .maybeSingle<{ id: string }>(),
    ]);
    hasAccess = registration?.access_status === "granted" || paidOrder?.access_status === "granted";
    activeAccessEndAt = registration?.access_end_at ?? null;
    isSaved = Boolean(savedWebinar?.id);
  }

  const isEnded = webinar.ends_at ? new Date(webinar.ends_at).getTime() < Date.now() : false;
  const isCancelled = webinar.status === "cancelled";
  const isCompleted = webinar.status === "completed" || isEnded;
  const enrollmentOpen = ["scheduled", "live"].includes(webinar.status) && !isEnded;

  const canJoin = hasAccess && !isCancelled && !isCompleted && shouldShowMeetingJoinWindow(webinar.starts_at, webinar.ends_at);

  const { data: featuredRow } = await dataClient
    .from("active_featured_webinars")
    .select("webinar_id")
    .eq("webinar_id", webinar.id)
    .maybeSingle<{ webinar_id: string }>();
  const isFeaturedWebinar = Boolean(featuredRow?.webinar_id);

  const statusLabel = isCancelled
    ? "Webinar Cancelled"
    : isCompleted
    ? "Webinar Completed"
    : webinar.status === "live"
      ? "Live"
      : "Upcoming";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {webinar.banner_url ? <img src={webinar.banner_url} alt={webinar.title} className="h-56 w-full rounded-xl object-cover" /> : null}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{webinar.title}</h1>
            {isFeaturedWebinar ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Featured</span> : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">{instituteName(webinar.institutes)}</p>
          <p className="mt-1 text-sm text-slate-600">Starts: {toDateTimeLabel(webinar.starts_at)}</p>
          <p className="text-sm text-slate-600">Ends: {toDateTimeLabel(webinar.ends_at)}</p>
          <p className="text-sm text-slate-600">Timezone: {webinar.timezone ?? "Asia/Kolkata"}</p>

          <p className="mt-3 text-sm text-slate-700">{webinar.description ?? "No description provided."}</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="font-medium">Mode:</span> {webinar.webinar_mode}</p>
            <p><span className="font-medium">Price:</span> {webinar.webinar_mode === "paid" ? toCurrency(Number(webinar.price ?? 0), webinar.currency ?? "INR") : "Free"}</p>
            <p><span className="font-medium">Provider:</span> {webinar.meeting_provider ?? "google_meet"}</p>
            {typeof webinar.max_attendees === "number" ? <p><span className="font-medium">Capacity:</span> {webinar.max_attendees}</p> : null}
          </div>

          {webinar.faculty_name ? <p className="mt-3 text-sm"><span className="font-medium">Faculty:</span> {webinar.faculty_name}</p> : null}
          {webinar.faculty_bio ? <p className="mt-1 text-sm text-slate-600">{webinar.faculty_bio}</p> : null}

          {isCancelled ? <p className="mt-3 rounded bg-rose-50 p-2 text-sm text-rose-700">This webinar has been cancelled.</p> : null}
          {isCompleted ? <p className="mt-3 rounded bg-slate-100 p-2 text-sm text-slate-700">This webinar is completed.</p> : null}
        </section>

        <WebinarActionCard
          webinarId={webinar.id}
          webinarTitle={webinar.title}
          webinarMode={webinar.webinar_mode}
          price={Number(webinar.price ?? 0)}
          isLoggedIn={Boolean(viewer?.user)}
          enrollmentStatus={hasAccess ? "enrolled" : "none"}
          activeAccessEndAt={activeAccessEndAt}
          enrollmentOpen={enrollmentOpen}
          statusLabel={statusLabel}
          canJoin={canJoin}
          joinUrl={canJoin ? webinar.meeting_url : null}
          isStudent={viewer?.profile.role === "student"}
          initiallySaved={isSaved}
        />
      </div>
    </div>
  );
}
