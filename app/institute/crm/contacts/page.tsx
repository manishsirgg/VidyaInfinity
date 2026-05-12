import Link from "next/link";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CRM_CONTACT_PRIORITIES, CRM_CONTACT_STAGES, crmLabel } from "@/lib/institute/crm-enums";

export const dynamic = "force-dynamic";

type Params = { q?: string; stage?: string; priority?: string; type?: string; archived?: string; source?: string; page?: string; due?: string };

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");
const badge = (text?: string | null) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{crmLabel(text)}</span>;
const relTitle = (value: unknown) => Array.isArray(value) ? value[0]?.title : (value as { title?: string } | null)?.title;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1"));
  const pageSize = 20;
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const { data: institute, error: instituteError } = await dataClient.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (instituteError) throw new Error(`Unable to load CRM institute profile: ${instituteError.message}`);
  if (!institute) return <div className="p-6">Institute profile not found.</div>;

  let q = dataClient
    .from("crm_contacts")
    .select("id,full_name,email,phone,whatsapp_number,source,lifecycle_stage,priority,next_follow_up_at,last_activity_at,created_at,course_id,webinar_id,courses(title),webinars(title)", { count: "exact" })
    .eq("owner_type", "institute")
    .eq("owner_institute_id", institute.id)
    .eq("is_deleted", false);

  if (params.archived === "archived") q = q.eq("is_archived", true); else if (params.archived !== "all") q = q.eq("is_archived", false);
  if (params.q) q = q.or(`full_name.ilike.%${params.q}%,email.ilike.%${params.q}%,phone.ilike.%${params.q}%,whatsapp_number.ilike.%${params.q}%`);
  if (params.stage) q = q.eq("lifecycle_stage", params.stage);
  if (params.priority) q = q.eq("priority", params.priority);
  if (params.source) q = q.eq("source", params.source);
  if (params.type === "course") q = q.not("course_id", "is", null);
  if (params.type === "webinar") q = q.not("webinar_id", "is", null);
  const now = new Date();
  if (params.due === "overdue") q = q.lt("next_follow_up_at", now.toISOString());

  const { data, error, count } = await q.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(`Unable to load CRM contacts: ${error.message}`);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const base = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && k !== "page" && base.set(k, v));

  return <div className="mx-auto max-w-7xl space-y-4 p-6">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">CRM Contacts</h1><Link href="/institute/crm" className="text-sm text-blue-600">Back to Dashboard</Link></div>

    <form className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6">
      <input name="q" defaultValue={params.q} placeholder="Search name/email/phone" className="rounded border px-3 py-2 md:col-span-2" />
      <select name="stage" defaultValue={params.stage ?? ""} className="rounded border px-3 py-2"><option value="">All stages</option>{CRM_CONTACT_STAGES.map((v) => <option key={v} value={v}>{crmLabel(v)}</option>)}</select>
      <select name="priority" defaultValue={params.priority ?? ""} className="rounded border px-3 py-2"><option value="">All priorities</option>{CRM_CONTACT_PRIORITIES.map((v) => <option key={v} value={v}>{crmLabel(v)}</option>)}</select>
      <select name="type" defaultValue={params.type ?? "all"} className="rounded border px-3 py-2"><option value="all">All types</option><option value="course">Course leads</option><option value="webinar">Webinar leads</option></select>
      <select name="archived" defaultValue={params.archived ?? "active"} className="rounded border px-3 py-2"><option value="active">Active only</option><option value="archived">Archived only</option><option value="all">All</option></select>
      <input name="source" defaultValue={params.source} placeholder="Source" className="rounded border px-3 py-2" />
      <button className="rounded bg-slate-900 px-3 py-2 text-white">Apply</button>
    </form>

    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-3">Name</th><th>Contact</th><th>Source/Type</th><th>Stage</th><th>Priority</th><th>Next Follow-up</th><th>Last Activity</th><th>Created</th><th></th></tr></thead>
        <tbody>
          {(data ?? []).map((c) => <tr key={c.id} className="border-t"><td className="p-3 font-medium">{c.full_name || "Unnamed"}</td><td>{c.email || "—"}<div>{c.phone || c.whatsapp_number || "—"}</div></td><td>{c.source || "—"}<div className="text-xs text-slate-500">{relTitle(c.courses) ? `Course: ${relTitle(c.courses)}` : relTitle(c.webinars) ? `Webinar: ${relTitle(c.webinars)}` : "No linked lead"}</div></td><td>{badge(c.lifecycle_stage)}</td><td>{badge(c.priority)}</td><td>{fmt(c.next_follow_up_at)}</td><td>{fmt(c.last_activity_at)}</td><td>{fmt(c.created_at)}</td><td><Link href={`/institute/crm/contacts/${c.id}`} className="text-blue-600">View</Link></td></tr>)}
        </tbody>
      </table>
      {!data?.length ? <div className="p-4 text-sm text-slate-600">{Object.keys(params).some((k) => params[k as keyof Params]) ? "No contacts match your filters." : "No CRM contacts yet."}</div> : null}
    </div>

    <div className="flex items-center justify-between text-sm">
      <span>Page {page} of {totalPages} · {total} total</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="rounded border px-3 py-1" href={`/institute/crm/contacts?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page - 1) })}`}>Prev</Link> : null}
        {page < totalPages ? <Link className="rounded border px-3 py-1" href={`/institute/crm/contacts?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page + 1) })}`}>Next</Link> : null}
      </div>
    </div>
  </div>;
}
