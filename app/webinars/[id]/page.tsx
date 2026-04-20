import { notFound } from "next/navigation";

import { WebinarActionCard } from "@/components/webinars/webinar-action-card";
import { getCurrentUserProfile } from "@/lib/auth/get-session";
import { shouldShowMeetingJoinWindow, toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { expireWebinarFeaturedSubscriptionsSafe } from "@/lib/webinar-featured";

function instituteName(value: unknown) {
  if (Array.isArray(value)) return ((value[0] as { name?: string } | undefined)?.name ?? "Institute");
  return ((value as { name?: string } | null)?.name ?? "Institute");
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
    .select("id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,meeting_url,meeting_provider,faculty_name,faculty_bio,banner_url,thumbnail_url,approval_status,status,institutes(name)")
    .eq("id", id)
    .eq("approval_status", "approved")
    .in("status", ["scheduled", "live"])
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (!webinar) notFound();

  let hasAccess = false;
  if (viewer?.user.id) {
    const { data: registration } = await dataClient
      .from("webinar_registrations")
      .select("access_status")
      .eq("webinar_id", id)
      .eq("student_id", viewer.user.id)
      .maybeSingle<{ access_status: string }>();
    hasAccess = registration?.access_status === "granted";
  }

  const canJoin = hasAccess && shouldShowMeetingJoinWindow(webinar.starts_at, webinar.ends_at);

  const { data: featuredRow } = await dataClient.from("active_featured_webinars").select("webinar_id").eq("webinar_id", webinar.id).maybeSingle<{ webinar_id: string }>();
  const isFeaturedWebinar = Boolean(featuredRow?.webinar_id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {webinar.banner_url ? <img src={webinar.banner_url} alt={webinar.title} className="h-56 w-full rounded-xl object-cover" /> : null}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{webinar.title}</h1>
            {isFeaturedWebinar ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Featured</span> : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">{instituteName(webinar.institutes)} · {toDateTimeLabel(webinar.starts_at)}</p>
          <p className="mt-3 text-sm text-slate-700">{webinar.description ?? "No description provided."}</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="font-medium">Mode:</span> {webinar.webinar_mode}</p>
            <p><span className="font-medium">Price:</span> {webinar.webinar_mode === "paid" ? toCurrency(Number(webinar.price), webinar.currency) : "Free"}</p>
            <p><span className="font-medium">Timezone:</span> {webinar.timezone}</p>
            <p><span className="font-medium">Provider:</span> {webinar.meeting_provider ?? "google_meet"}</p>
          </div>
          {webinar.faculty_name ? <p className="mt-3 text-sm"><span className="font-medium">Faculty:</span> {webinar.faculty_name}</p> : null}
          {webinar.faculty_bio ? <p className="mt-1 text-sm text-slate-600">{webinar.faculty_bio}</p> : null}
        </section>

        <WebinarActionCard
          webinarId={webinar.id}
          webinarTitle={webinar.title}
          webinarMode={webinar.webinar_mode}
          price={Number(webinar.price ?? 0)}
          canJoin={canJoin}
          meetingUrl={canJoin ? webinar.meeting_url : null}
          isLoggedIn={Boolean(viewer?.user)}
        />
      </div>
    </div>
  );
}
