import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/shared/status-badge";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toDateTimeLabel } from "@/lib/webinars/utils";

function profileField(value: unknown, key: "full_name" | "email") {
  if (Array.isArray(value)) return ((value[0] as { full_name?: string; email?: string } | undefined)?.[key] ?? null);
  return ((value as { full_name?: string; email?: string } | null)?.[key] ?? null);
}

export default async function WebinarAttendeesPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const { id } = await params;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute } = await dataClient.from("institutes").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  if (!institute) notFound();

  const { data: webinar } = await dataClient.from("webinars").select("id,title").eq("id", id).eq("institute_id", institute.id).maybeSingle<{ id: string; title: string }>();
  if (!webinar) notFound();

  const { data: attendees } = await dataClient
    .from("webinar_registrations")
    .select("id,registration_status,payment_status,access_status,joined_at,left_at,attended_at,profiles!webinar_registrations_student_id_fkey(full_name,email)")
    .eq("webinar_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Attendees · {webinar.title}</h1>
      <div className="mt-4 space-y-2">
        {(attendees ?? []).map((row) => (
          <article key={row.id} className="rounded border bg-white p-3 text-sm">
            <p className="font-medium">{profileField(row.profiles, "full_name") ?? profileField(row.profiles, "email") ?? "Student"}</p>
            <p className="text-slate-600">{profileField(row.profiles, "email") ?? "-"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={row.registration_status} />
              <StatusBadge status={row.payment_status} />
              <StatusBadge status={row.access_status} />
            </div>
            <p className="mt-1 text-xs text-slate-500">Joined: {toDateTimeLabel(row.joined_at)} · Left: {toDateTimeLabel(row.left_at)} · Attended: {toDateTimeLabel(row.attended_at)}</p>
          </article>
        ))}
        {(attendees ?? []).length === 0 ? <p className="rounded border border-dashed bg-white p-8 text-center text-slate-600">No attendees yet.</p> : null}
      </div>
    </div>
  );
}
