import Link from "next/link";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Date(value).toLocaleString();
};
const relName = (value: unknown) => Array.isArray(value) ? value[0]?.full_name : (value as { full_name?: string } | null)?.full_name;

export default async function InstituteCrmPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute, error: instituteError } = await dataClient.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (instituteError) throw new Error(`Unable to load CRM institute profile: ${instituteError.message}`);
  if (!institute) return <div className="p-6">Institute profile not found.</div>;

  const [contacts, follow, acts] = await Promise.all([
    dataClient.from("crm_contacts").select("id,full_name,lifecycle_stage,priority,course_id,webinar_id,converted,is_archived").eq("owner_type", "institute").eq("owner_institute_id", institute.id).eq("is_deleted", false),
    dataClient.from("crm_follow_ups").select("id,contact_id,purpose,channel,status,due_at,crm_contacts(full_name)").eq("institute_id", institute.id).eq("is_deleted", false).order("due_at", { ascending: true }).limit(15),
    dataClient.from("crm_activities").select("id,title,description,created_at,contact_id").eq("institute_id", institute.id).order("created_at", { ascending: false }).limit(10),
  ]);
  if (contacts.error || follow.error || acts.error) {
    throw new Error(`Unable to load CRM overview data. ${contacts.error?.message ?? ""} ${follow.error?.message ?? ""} ${acts.error?.message ?? ""}`);
  }

  const c = contacts.data ?? [];
  const f = follow.data ?? [];
  const now = new Date();
  const today = now.toDateString();
  const cards = [
    { k: "Total Leads", v: c.length },
    { k: "New", v: c.filter((x) => x.lifecycle_stage === "new").length },
    { k: "Contacted", v: c.filter((x) => x.lifecycle_stage === "contacted").length },
    { k: "Converted", v: c.filter((x) => x.converted || x.lifecycle_stage === "converted").length },
    { k: "Follow-ups Due Today", v: f.filter((x) => x.status === "pending" && x.due_at && new Date(x.due_at).toDateString() === today).length },
    { k: "Overdue Follow-ups", v: f.filter((x) => x.status === "pending" && x.due_at && new Date(x.due_at) < now).length },
    { k: "High Priority", v: c.filter((x) => x.priority === "high" || x.priority === "urgent").length },
    { k: "Course Leads", v: c.filter((x) => x.course_id).length },
    { k: "Webinar Leads", v: c.filter((x) => x.webinar_id).length },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">CRM Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/institute/crm/contacts" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">View All Contacts</Link>
          <Link href="/institute/crm/contacts?due=today" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Follow-ups Due</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div key={card.k} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.k}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{card.v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
          <div className="mt-3 space-y-3">
            {(acts.data ?? []).map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-100 p-3">
                <p className="font-medium text-slate-900">{a.title}</p>
                <p className="text-xs text-slate-500">{formatDateTime(a.created_at)}</p>
                {a.description ? <p className="mt-1 text-sm text-slate-600">{a.description}</p> : null}
                {a.contact_id ? <Link href={`/institute/crm/contacts/${a.contact_id}`} className="mt-1 inline-block text-sm text-blue-600">View contact</Link> : null}
              </div>
            ))}
            {!acts.data?.length ? <p className="text-sm text-slate-500">No recent activity.</p> : null}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming Follow-ups</h2>
          <div className="mt-3 space-y-3">
            {f.filter((item) => item.status === "pending").slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <p className="font-medium text-slate-900">{item.purpose || "Follow-up"}</p>
                <p className="text-slate-600">Due: {formatDateTime(item.due_at)}</p>
                <p className="text-slate-600">Channel: {item.channel || "—"} · Status: {item.status}</p>
                <p className="text-slate-600">Contact: {relName(item.crm_contacts) ?? "Unknown"}</p>
                {item.contact_id ? <Link href={`/institute/crm/contacts/${item.contact_id}`} className="text-blue-600">Open contact</Link> : null}
              </div>
            ))}
            {!f.length ? <p className="text-sm text-slate-500">No follow-ups scheduled.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
