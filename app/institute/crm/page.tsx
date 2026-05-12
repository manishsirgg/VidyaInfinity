import Link from "next/link";
import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InstituteCrmPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute, error: instituteError } = await dataClient.from("institutes").select("id").eq("user_id", user.id).maybeSingle();
  if (instituteError) {
    console.error("Failed to resolve institute for CRM overview", { userId: user.id, error: instituteError.message });
    throw new Error("Unable to load CRM institute profile.");
  }
  if (!institute) return <div className="p-6">Institute profile not found.</div>;
  const [contacts, follow, acts] = await Promise.all([
    dataClient.from("crm_contacts").select("id,lifecycle_stage,priority,course_id,webinar_id,converted,is_archived").eq("owner_type", "institute").eq("owner_institute_id", institute.id).eq("is_deleted", false),
    dataClient.from("crm_follow_ups").select("id,due_at,status").eq("institute_id", institute.id).eq("is_deleted", false),
    dataClient.from("crm_activities").select("id,title,created_at").eq("institute_id", institute.id).order("created_at", { ascending: false }).limit(8),
  ]);
  if (contacts.error || follow.error || acts.error) {
    console.error("Failed to load CRM overview", {
      instituteId: institute.id,
      contactsError: contacts.error?.message,
      followError: follow.error?.message,
      activitiesError: acts.error?.message,
    });
    throw new Error("Unable to load CRM overview data.");
  }
  const c = contacts.data ?? []; const f = follow.data ?? []; const now = new Date();
  const cards = [{k:"Total Leads",v:c.length},{k:"New",v:c.filter(x=>x.lifecycle_stage==="new").length},{k:"Contacted",v:c.filter(x=>x.lifecycle_stage==="contacted").length},{k:"Converted",v:c.filter(x=>x.converted||x.lifecycle_stage==="converted").length},{k:"Follow-ups Due Today",v:f.filter(x=>x.status==="pending"&&x.due_at&&new Date(x.due_at).toDateString()===now.toDateString()).length},{k:"Overdue Follow-ups",v:f.filter(x=>x.status==="pending"&&x.due_at&&new Date(x.due_at)<now).length},{k:"High Priority",v:c.filter(x=>x.priority==="high"||x.priority==="urgent").length},{k:"Course Leads",v:c.filter(x=>x.course_id).length},{k:"Webinar Leads",v:c.filter(x=>x.webinar_id).length}];
  return <div className="mx-auto max-w-6xl p-6"><h1 className="text-2xl font-semibold">CRM Overview</h1><div className="mt-4 grid gap-3 sm:grid-cols-3">{cards.map(card=><div key={card.k} className="rounded border bg-white p-4"><p className="text-xs text-slate-500">{card.k}</p><p className="text-2xl font-semibold">{card.v}</p></div>)}</div><div className="mt-6"><Link className="text-blue-600 underline" href="/institute/crm/contacts">View contacts</Link></div><h2 className="mt-8 font-semibold">Recent activity</h2><ul className="mt-2 space-y-2">{(acts.data??[]).map(a=><li key={a.id} className="rounded border p-3 text-sm">{a.title} <span className="text-slate-500">{new Date(a.created_at).toLocaleString()}</span></li>)}</ul></div>;
}
