import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN");
}

export default async function InstituteLeadsPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute, error: instituteError } = await dataClient
    .from("institutes")
    .select("id,name")
    .eq("user_id", user.id)
    .maybeSingle();

  const leadsResult = institute
    ? await dataClient
        .from("leads")
        .select("id,name,email,phone,message,created_at,course_id")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  const leads = leadsResult.data ?? [];
  const leadsError = leadsResult.error;

  const courseIds = [...new Set(leads.map((lead) => lead.course_id).filter(Boolean))];
  const courseResult = courseIds.length
    ? await dataClient.from("courses").select("id,title").in("id", courseIds)
    : { data: [], error: null };
  const courseById = new Map((courseResult.data ?? []).map((course) => [course.id, course]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Institute Leads</h1>
          <p className="mt-2 text-sm text-slate-600">
            Review and follow up with students who submitted inquiries for your courses.
          </p>
        </div>
        <Link href="/institute/dashboard" className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          Back to dashboard
        </Link>
      </div>

      {instituteError ? (
        <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Could not load institute record: {instituteError.message}
        </p>
      ) : null}

      {leadsError ? (
        <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Could not load leads right now: {leadsError.message}
        </p>
      ) : null}

      {!institute ? (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Institute record not found for this account. Please complete onboarding or contact support.
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {leads.map((lead) => {
          const course = lead.course_id ? courseById.get(lead.course_id) : null;

          return (
          <article key={lead.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{lead.name || "Unnamed lead"}</p>
                <p className="mt-1 text-sm text-slate-700">
                  {lead.email || "Email not provided"} · {lead.phone || "Phone not provided"}
                </p>
                <p className="mt-1 text-xs text-slate-500">Created: {formatDate(lead.created_at)}</p>
              </div>
              <div className="rounded border bg-slate-50 px-2 py-1 text-xs text-slate-700">{course?.title || "General inquiry"}</div>
            </div>
            {lead.message ? <p className="mt-3 rounded border bg-slate-50 px-3 py-2 text-sm text-slate-700">{lead.message}</p> : null}
          </article>
          );
        })}
        {courseResult.error ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Some course titles could not be loaded: {courseResult.error.message}
          </p>
        ) : null}
        {institute && leads.length === 0 && !leadsError ? (
          <div className="rounded border bg-white p-4 text-sm text-slate-600">No leads yet. Leads will appear here when students submit course inquiries.</div>
        ) : null}
      </div>
    </div>
  );
}
