import Link from "next/link";
import { notFound } from "next/navigation";
import { AddFollowUpForm, AddNoteForm, FollowUpActions, StagePriorityForm } from "./CrmClientActions";
import { requireUser } from "@/lib/auth/get-session";
import { crmLabel } from "@/lib/institute/crm-enums";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");
const badge = (text?: string | null) => <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{crmLabel(text)}</span>;
const relTitle = (value: unknown) => Array.isArray(value) ? value[0]?.title : (value as { title?: string } | null)?.title;

export default async function ContactDetail({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const { data: institute, error: instituteError } = await dataClient.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (instituteError) throw new Error(`Unable to load CRM institute profile: ${instituteError.message}`);
  if (!institute) return <div className="p-6">Institute profile not found.</div>;

  const { data: contact, error: contactError } = await dataClient.from("crm_contacts").select("*,courses(title),webinars(title)").eq("id", contactId).eq("owner_type", "institute").eq("owner_institute_id", institute.id).eq("is_deleted", false).maybeSingle();
  if (contactError) throw new Error(`Unable to load CRM contact: ${contactError.message}`);
  if (!contact || contact.is_archived) return notFound();

  const [notes, followUps, activities] = await Promise.all([
    dataClient.from("crm_notes").select("*").eq("contact_id", contactId).eq("institute_id", institute.id).eq("is_deleted", false).order("created_at", { ascending: false }),
    dataClient.from("crm_follow_ups").select("*").eq("contact_id", contactId).eq("institute_id", institute.id).eq("is_deleted", false).order("due_at"),
    dataClient.from("crm_activities").select("*").eq("contact_id", contactId).eq("institute_id", institute.id).order("created_at", { ascending: false }),
  ]);
  if (notes.error || followUps.error || activities.error) throw new Error(`Unable to load CRM contact details. ${notes.error?.message ?? ""}${followUps.error?.message ?? ""}${activities.error?.message ?? ""}`);

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{contact.full_name || "Unnamed"}</h1><p className="text-sm text-slate-600">{contact.email || "—"} · {contact.phone || contact.whatsapp_number || "—"}</p></div>
      <div className="flex items-center gap-2">{badge(contact.lifecycle_stage)}{badge(contact.priority)}<Link className="text-sm text-blue-600" href="/institute/crm/contacts">Back to contacts</Link></div>
    </div>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-lg font-semibold">Contact Info</h2>
          <div className="grid gap-2 sm:grid-cols-2"><p><strong>Full name:</strong> {contact.full_name || "—"}</p><p><strong>Email:</strong> {contact.email || "—"}</p><p><strong>Phone:</strong> {contact.phone || "—"}</p><p><strong>WhatsApp:</strong> {contact.whatsapp_number || "—"}</p><p><strong>Source:</strong> {contact.source || "—"}</p><p><strong>Created:</strong> {fmt(contact.created_at)}</p><p><strong>Last contacted:</strong> {fmt(contact.last_contacted_at)}</p><p><strong>Last activity:</strong> {fmt(contact.last_activity_at)}</p></div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><h2 className="mb-2 text-lg font-semibold">Linked Course/Webinar</h2>
          {relTitle(contact.courses) ? <p>Course lead: <strong>{relTitle(contact.courses)}</strong></p> : null}
          {relTitle(contact.webinars) ? <p>Webinar lead: <strong>{relTitle(contact.webinars)}</strong></p> : null}
          {!relTitle(contact.courses) && !relTitle(contact.webinars) ? <p>No linked course/webinar.</p> : null}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-2 text-lg font-semibold">Notes</h2>
          <div className="space-y-2">{(notes.data ?? []).map((n) => <div key={n.id} className="rounded border border-slate-100 p-2 text-sm"><div className="mb-1 flex items-center gap-2">{badge(n.note_type)}{n.is_pinned ? <span className="text-xs text-amber-700">Pinned</span> : null}</div><p>{n.note}</p><p className="mt-1 text-xs text-slate-500">{fmt(n.created_at)}</p></div>)}{!notes.data?.length ? <p className="text-sm text-slate-500">No notes yet.</p> : null}</div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-2 text-lg font-semibold">Follow-ups</h2><div className="space-y-2">{(followUps.data ?? []).map((f) => <div key={f.id} className="rounded border border-slate-100 p-2 text-sm"><p className="font-medium">{f.purpose || "Follow-up"}</p><p>Channel: {crmLabel(f.channel)} · Status: {crmLabel(f.status)}</p><p>Due: {fmt(f.due_at)}</p>{f.notes ? <p>Notes: {f.notes}</p> : null}{f.completed_at ? <p>Completed: {fmt(f.completed_at)}</p> : null}{f.cancelled_at ? <p>Cancelled: {fmt(f.cancelled_at)}</p> : null}<FollowUpActions followUpId={f.id} status={f.status} /></div>)}{!followUps.data?.length ? <p className="text-sm text-slate-500">No follow-ups scheduled.</p> : null}</div></section>
        <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-2 text-lg font-semibold">Activity Timeline</h2><div className="space-y-2">{(activities.data ?? []).map((a) => <div key={a.id} className="rounded border border-slate-100 p-2 text-sm"><p className="font-medium">{a.title}</p>{a.description ? <p>{a.description}</p> : null}<p className="text-xs text-slate-500">{fmt(a.created_at)}</p></div>)}{!activities.data?.length ? <p className="text-sm text-slate-500">No activity recorded.</p> : null}</div></section>
      </div>
      <div className="space-y-4">
        <StagePriorityForm contactId={contactId} lifecycleStage={contact.lifecycle_stage} priority={contact.priority} nextFollowUpAt={contact.next_follow_up_at} />
        <AddNoteForm contactId={contactId} />
        <AddFollowUpForm contactId={contactId} />
      </div>
    </div>
  </div>;
}
