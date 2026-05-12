import Link from "next/link";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; priority?: string }> }) {
  const { user } = await requireUser("institute", { requireApproved: false });
  const params = await searchParams; const supabase = await createClient();
  const { data: institute } = await supabase.from("institutes").select("id").eq("user_id", user.id).maybeSingle(); if (!institute) return <div className="p-6">Institute profile not found.</div>;
  let q = supabase.from("crm_contacts").select("id,full_name,email,phone,whatsapp_number,source,lifecycle_stage,priority,next_follow_up_at,created_at").eq("owner_type","institute").eq("owner_institute_id",institute.id).eq("is_deleted",false);
  if (params.q) q = q.or(`full_name.ilike.%${params.q}%,email.ilike.%${params.q}%,phone.ilike.%${params.q}%,whatsapp_number.ilike.%${params.q}%`);
  if (params.stage) q = q.eq("lifecycle_stage", params.stage); if (params.priority) q = q.eq("priority", params.priority);
  const { data } = await q.order("created_at",{ascending:false});
  return <div className="mx-auto max-w-6xl p-6"><h1 className="text-2xl font-semibold">CRM Contacts</h1><form className="mt-4 flex gap-2"><input name="q" defaultValue={params.q} placeholder="Search" className="rounded border px-3 py-2"/><button className="rounded bg-slate-800 px-3 py-2 text-white">Search</button></form><div className="mt-4 space-y-2">{(data??[]).map(c=><div key={c.id} className="rounded border p-3"><Link className="font-medium text-blue-700" href={`/institute/crm/contacts/${c.id}`}>{c.full_name||"Unnamed"}</Link><div className="text-sm text-slate-600">{c.email} · {c.phone||c.whatsapp_number} · {c.lifecycle_stage} · {c.priority}</div></div>)}{!data?.length&&<div className="rounded border p-3 text-sm">No contacts found.</div>}</div></div>;
}
