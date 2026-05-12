import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ContactDetail({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params; const { user } = await requireUser("institute", { requireApproved: false }); const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  const { data: institute, error: instituteError } = await dataClient.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (instituteError) {
    console.error("Failed to resolve institute for CRM contact detail", { userId: user.id, error: instituteError.message });
    throw new Error("Unable to load CRM institute profile.");
  }
  if (!institute) return <div className="p-6">Institute profile not found.</div>;
  const { data: contact, error: contactError } = await dataClient.from("crm_contacts").select("*").eq("id", contactId).eq("owner_type", "institute").eq("owner_institute_id", institute.id).eq("is_deleted", false).eq("is_archived", false).maybeSingle();
  if (contactError) {
    console.error("Failed to load CRM contact", { instituteId: institute.id, contactId, error: contactError.message });
    throw new Error("Unable to load CRM contact.");
  }
  if (!contact) return notFound();
  const [notes, followUps, activities] = await Promise.all([
    dataClient.from("crm_notes").select("*").eq("contact_id", contactId).eq("institute_id", institute.id).eq("is_deleted", false).order("created_at", { ascending: false }),
    dataClient.from("crm_follow_ups").select("*").eq("contact_id", contactId).eq("institute_id", institute.id).eq("is_deleted", false).order("due_at"),
    dataClient.from("crm_activities").select("*").eq("contact_id", contactId).eq("institute_id", institute.id).order("created_at", { ascending: false }),
  ]);
  if (notes.error || followUps.error || activities.error) {
    console.error("Failed to load CRM contact detail related data", {
      instituteId: institute.id,
      contactId,
      notesError: notes.error?.message,
      followUpsError: followUps.error?.message,
      activitiesError: activities.error?.message,
    });
    throw new Error("Unable to load CRM contact details.");
  }
  return <div className="mx-auto max-w-6xl p-6"><h1 className="text-2xl font-semibold">{contact.full_name||"Unnamed"}</h1><p className="text-sm text-slate-600">{contact.email} · {contact.phone||contact.whatsapp_number}</p><div className="mt-3 text-sm">Stage: {contact.lifecycle_stage} | Priority: {contact.priority}</div><h2 className="mt-6 font-semibold">Notes</h2>{(notes.data??[]).map(n=><div key={n.id} className="mt-2 rounded border p-2 text-sm">{n.note}</div>)}<h2 className="mt-6 font-semibold">Follow-ups</h2>{(followUps.data??[]).map(f=><div key={f.id} className="mt-2 rounded border p-2 text-sm">{f.purpose} · {f.status}</div>)}<h2 className="mt-6 font-semibold">Activity Timeline</h2>{(activities.data??[]).map(a=><div key={a.id} className="mt-2 rounded border p-2 text-sm">{a.title}</div>)}</div>;
}
