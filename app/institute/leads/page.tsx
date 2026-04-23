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
        .select("id,name,email,phone,message,created_at,course_id,webinar_id,lead_target,source")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  const legacyLeadsResult =
    institute && leadsResult.error?.message?.includes("webinar_id")
      ? await dataClient
          .from("leads")
          .select("id,name,email,phone,message,created_at,course_id,lead_target,source")
          .eq("institute_id", institute.id)
          .order("created_at", { ascending: false })
      : null;

  const leads = (legacyLeadsResult?.data ?? leadsResult.data ?? []) as Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    created_at: string;
    course_id: string | null;
    webinar_id?: string | null;
    lead_target?: string | null;
    source?: string | null;
  }>;
  const leadsError = legacyLeadsResult?.error ?? (legacyLeadsResult ? null : leadsResult.error);

  const courseIds = [...new Set(leads.map((lead) => lead.course_id).filter(Boolean))];
  const webinarIds = [...new Set(leads.map((lead) => lead.webinar_id).filter(Boolean))];
  const courseResult = courseIds.length
    ? await dataClient.from("courses").select("id,title").in("id", courseIds)
    : { data: [], error: null };
  const webinarResult = webinarIds.length
    ? await dataClient.from("webinars").select("id,title,starts_at").in("id", webinarIds)
    : { data: [], error: null };
  const courseById = new Map((courseResult.data ?? []).map((course) => [course.id, course]));
  const webinarById = new Map((webinarResult.data ?? []).map((webinar) => [webinar.id, webinar]));
  const courseLeads = leads.filter((lead) => (lead.lead_target ?? "course") === "course").length;
  const webinarLeads = leads.filter((lead) => lead.lead_target === "webinar").length;
  const recentLeads = leads.filter((lead) => Date.now() - new Date(lead.created_at).getTime() <= 1000 * 60 * 60 * 24 * 7).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Institute Leads</h1>
          <p className="mt-2 text-sm text-slate-600">
            Review and follow up with students who submitted inquiries for your courses.
          </p>
        </div>
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

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total leads</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{leads.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Course / webinar</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{courseLeads} / {webinarLeads}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last 7 days</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{recentLeads}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {leads.map((lead) => {
          const course = lead.course_id ? courseById.get(lead.course_id) : null;
          const webinar = lead.webinar_id ? webinarById.get(lead.webinar_id) : null;
          const isWebinarLead = lead.lead_target === "webinar";
          const targetTitle = isWebinarLead ? webinar?.title : course?.title;

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
              <div className="rounded border bg-slate-50 px-2 py-1 text-xs text-slate-700">
                {isWebinarLead ? "Webinar" : "Course"} · {targetTitle || "General inquiry"}
              </div>
            </div>
            {webinar?.starts_at ? <p className="mt-2 text-xs text-slate-500">Webinar starts: {formatDate(webinar.starts_at)}</p> : null}
            {lead.message ? <p className="mt-3 rounded border bg-slate-50 px-3 py-2 text-sm text-slate-700">{lead.message}</p> : null}
            {lead.source ? <p className="mt-2 text-xs text-slate-500">Source: {lead.source}</p> : null}
          </article>
          );
        })}
        {courseResult.error ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Some course titles could not be loaded: {courseResult.error.message}
          </p>
        ) : null}
        {webinarResult.error ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Some webinar titles could not be loaded: {webinarResult.error.message}
          </p>
        ) : null}
        {institute && leads.length === 0 && !leadsError ? (
          <div className="rounded border bg-white p-4 text-sm text-slate-600">No leads yet. Leads will appear here when students submit course inquiries.</div>
        ) : null}
      </div>
    </div>
  );
}
