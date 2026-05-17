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
const refText = (value: unknown) => typeof value === "string" ? value : "—";
const digitsOnly = (value?: string | null) => (value ?? "").replace(/[^\d+]/g, "");
const whatsappLink = (value?: string | null) => {
  const cleaned = digitsOnly(value).replace(/^\+/, "");
  return cleaned ? `https://wa.me/${cleaned}` : null;
};
const callLink = (value?: string | null) => {
  const cleaned = digitsOnly(value);
  return cleaned ? `tel:${cleaned}` : null;
};
const emailLink = (value?: string | null) => value?.trim() ? `mailto:${value.trim()}` : null;

type CrmMetadata = Record<string, unknown> | null;

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

  const allActivities = activities.data ?? [];
  const purchaseActivities = allActivities.filter((a) => ["course_purchased", "course_enrolled", "webinar_purchased"].includes(a.activity_type));
  const coursePurchaseCount = purchaseActivities.filter((a) => a.activity_type === "course_purchased").length;
  const webinarPurchaseCount = purchaseActivities.filter((a) => a.activity_type === "webinar_purchased").length;

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{contact.full_name || "Unnamed"}</h1><p className="text-sm text-slate-600">{contact.email || "—"} · {contact.phone || contact.whatsapp_number || "—"}</p><div className="mt-2 flex flex-wrap gap-2 text-xs">{emailLink(contact.email) ? <a href={emailLink(contact.email) ?? "#"} className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50">Email</a> : null}{callLink(contact.phone || contact.whatsapp_number) ? <a href={callLink(contact.phone || contact.whatsapp_number) ?? "#"} className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50">Call</a> : null}{whatsappLink(contact.whatsapp_number || contact.phone) ? <a href={whatsappLink(contact.whatsapp_number || contact.phone) ?? "#"} target="_blank" rel="noreferrer" className="rounded border border-emerald-300 px-2 py-1 text-emerald-700 hover:bg-emerald-50">WhatsApp</a> : null}</div></div>
      <div className="flex items-center gap-2">{badge(contact.lifecycle_stage)}{badge(contact.priority)}<Link className="text-sm text-blue-600" href="/institute/crm/contacts">Back to contacts</Link></div>
    </div>

    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Course purchases: {coursePurchaseCount}</span>
      <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Webinar purchases: {webinarPurchaseCount}</span>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Conversion events: {purchaseActivities.length}</span>
    </div>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-lg font-semibold">Contact Info</h2>
          <div className="grid gap-2 sm:grid-cols-2"><p><strong>Full name:</strong> {contact.full_name || "—"}</p><p><strong>Email:</strong> {contact.email || "—"}</p><p><strong>Phone:</strong> {contact.phone || "—"}</p><p><strong>WhatsApp:</strong> {contact.whatsapp_number || "—"}</p><p><strong>Source:</strong> {contact.source || "—"}</p><p><strong>Created:</strong> {fmt(contact.created_at)}</p><p><strong>Last contacted:</strong> {fmt(contact.last_contacted_at)}</p><p><strong>Last activity:</strong> {fmt(contact.last_activity_at)}</p></div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-lg font-semibold">Purchase History</h2>
          <div className="space-y-2">
            {purchaseActivities.map((a) => {
              const metadata = (a.metadata ?? null) as CrmMetadata;
              return <article key={a.id} className="rounded border border-slate-100 p-3 text-sm">
                <p className="font-medium">{a.title || crmLabel(a.activity_type)}</p>
                <p className="text-xs text-slate-500">{crmLabel(a.activity_type)} · {fmt(a.created_at)}</p>
                {a.description ? <p className="mt-1 text-slate-700">{a.description}</p> : null}
                <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                  {a.activity_type === "course_purchased" || a.activity_type === "course_enrolled" ? <><p>Course order reference: <span className="text-slate-500">{refText(metadata?.course_order_id)}</span></p><p>Enrollment reference: <span className="text-slate-500">{refText(metadata?.enrollment_id)}</span></p></> : null}
                  {a.activity_type === "webinar_purchased" ? <><p>Webinar order reference: <span className="text-slate-500">{refText(metadata?.webinar_order_id)}</span></p><p>Registration reference: <span className="text-slate-500">{refText(metadata?.registration_id)}</span></p></> : null}
                  <p>Payment status: <span className="text-slate-500">{refText(metadata?.payment_status)}</span></p>
                  <p>Access status: <span className="text-slate-500">{refText(metadata?.access_status)}</span></p>
                </div>
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">Technical details</summary>
                  <p>Razorpay order ref: {refText(metadata?.razorpay_order_id)}</p>
                  <p>Razorpay payment ref: {refText(metadata?.razorpay_payment_id)}</p>
                  <p>Dedupe key: {refText(metadata?.dedupe_key)}</p>
                </details>
              </article>;
            })}
            {!purchaseActivities.length && contact.converted ? <p className="text-sm text-slate-500">Converted contact. No purchase activity details found yet.</p> : null}
            {!purchaseActivities.length && !contact.converted ? <p className="text-sm text-slate-500">No purchase history yet.</p> : null}
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-2 text-lg font-semibold">Notes</h2>
          <div className="space-y-2">{(notes.data ?? []).map((n) => <div key={n.id} className="rounded border border-slate-100 p-2 text-sm"><div className="mb-1 flex items-center gap-2">{badge(n.note_type)}{n.is_pinned ? <span className="text-xs text-amber-700">Pinned</span> : null}</div><p>{n.note}</p><p className="mt-1 text-xs text-slate-500">{fmt(n.created_at)}</p></div>)}{!notes.data?.length ? <p className="text-sm text-slate-500">No notes yet.</p> : null}</div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-2 text-lg font-semibold">Follow-ups</h2><div className="space-y-2">{(followUps.data ?? []).map((f) => <div key={f.id} className="rounded border border-slate-100 p-2 text-sm"><p className="font-medium">{f.purpose || "Follow-up"}</p><p>Channel: {crmLabel(f.channel)} · Status: {crmLabel(f.status)}</p><p>Due: {fmt(f.due_at)}</p>{f.notes ? <p>Notes: {f.notes}</p> : null}{f.completed_at ? <p>Completed: {fmt(f.completed_at)}</p> : null}{f.cancelled_at ? <p>Cancelled: {fmt(f.cancelled_at)}</p> : null}<FollowUpActions followUpId={f.id} status={f.status} /></div>)}{!followUps.data?.length ? <p className="text-sm text-slate-500">No follow-ups scheduled.</p> : null}</div></section>
        <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="mb-2 text-lg font-semibold">Activity Timeline</h2><div className="space-y-2">{allActivities.map((a) => <div key={a.id} className="rounded border border-slate-100 p-2 text-sm"><p className="font-medium">{a.title}</p>{a.description ? <p>{a.description}</p> : null}<p className="text-xs text-slate-500">{fmt(a.created_at)}</p></div>)}{!allActivities.length ? <p className="text-sm text-slate-500">No activity recorded.</p> : null}</div></section>
      </div>
      <div className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <h2 className="mb-2 text-lg font-semibold">Conversion Summary</h2>
          <div className="space-y-1">
            <p><strong>Converted:</strong> {contact.converted ? "Yes" : "No"}</p>
            <p><strong>Converted at:</strong> {fmt(contact.converted_at)}</p>
            <p><strong>Current lifecycle stage:</strong> {crmLabel(contact.lifecycle_stage)}</p>
            <p><strong>Last activity date:</strong> {fmt(contact.last_activity_at)}</p>
            <p><strong>Linked profile:</strong> {contact.profile_id ? "Linked" : "Not linked"}</p>
            <p className="text-xs text-slate-500">Last course order reference: {contact.last_course_order_id || "—"}</p>
            <p className="text-xs text-slate-500">Last webinar order reference: {contact.last_webinar_order_id || "—"}</p>
            <p><strong>Course lead:</strong> {relTitle(contact.courses) || "Not linked"}</p>
            <p><strong>Webinar lead:</strong> {relTitle(contact.webinars) || "Not linked"}</p>
          </div>
        </section>
        <StagePriorityForm contactId={contactId} lifecycleStage={contact.lifecycle_stage} priority={contact.priority} nextFollowUpAt={contact.next_follow_up_at} />
        <AddNoteForm contactId={contactId} />
        <AddFollowUpForm contactId={contactId} />
      </div>
    </div>
  </div>;
}
