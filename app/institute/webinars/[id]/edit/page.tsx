import { notFound } from "next/navigation";

import { WebinarForm } from "@/components/webinars/webinar-form";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function EditWebinarPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (!institute) notFound();

  const { data: webinar } = await dataClient
    .from("webinars")
    .select("id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,meeting_url,faculty_name,faculty_bio,thumbnail_url,banner_url,max_attendees,learning_points")
    .eq("id", id)
    .eq("institute_id", institute.id)
    .maybeSingle();

  if (!webinar) notFound();

  const toInputDateTime = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 16) : "");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Edit Webinar</h1>
      <p className="mt-1 text-sm text-slate-600">Editing approved webinars will move them back to pending moderation.</p>
      <div className="mt-6 rounded-xl border bg-white p-5">
        <WebinarForm
          mode="edit"
          webinarId={id}
          initialValues={{
            title: webinar.title,
            description: webinar.description ?? "",
            startsAt: toInputDateTime(webinar.starts_at),
            endsAt: toInputDateTime(webinar.ends_at),
            timezone: webinar.timezone,
            webinarMode: webinar.webinar_mode,
            price: Number(webinar.price ?? 0),
            currency: webinar.currency,
            meetingUrl: webinar.meeting_url ?? "",
            facultyName: webinar.faculty_name ?? "",
            facultyBio: webinar.faculty_bio ?? "",
            thumbnailUrl: webinar.thumbnail_url ?? "",
            bannerUrl: webinar.banner_url ?? "",
            maxAttendees: Number(webinar.max_attendees ?? 0),
            learningPoints: webinar.learning_points ?? "",
          }}
        />
      </div>
    </div>
  );
}
