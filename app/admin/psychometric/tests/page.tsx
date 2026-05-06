import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PsychometricAdminCard, PsychometricAdminHeader, PsychometricEmptyState, PsychometricStatusBadge } from "../_components/AdminPsychometricUI";

export default async function PsychometricTestsAdminPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string }> }) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  let query = supabase.from("psychometric_tests").select("id,title,slug,price,category,is_active,is_featured,duration_minutes,created_at").order("created_at",{ascending:false});
  if (params.q) query = query.ilike("title", `%${params.q}%`);
  if (params.status === "active") query = query.eq("is_active", true);
  if (params.status === "inactive") query = query.eq("is_active", false);
  const { data: tests } = await query;

  return <div className="space-y-4 p-3 md:p-6"><PsychometricAdminHeader title="Psychometric Tests" description="Create and manage psychometric assessments." breadcrumbs={[{label:"Admin",href:"/admin/dashboard"},{label:"Psychometric",href:"/admin/psychometric"},{label:"Tests"}]} action={<Link href="/admin/psychometric/tests/new" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Create Psychometric Test</Link>} />
  <PsychometricAdminCard><form className="grid gap-2 md:grid-cols-3"><input name="q" placeholder="Search by title" defaultValue={params.q ?? ""} className="rounded border p-2"/><select name="status" defaultValue={params.status ?? "all"} className="rounded border p-2"><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button className="rounded border px-3 py-2">Apply</button></form></PsychometricAdminCard>
  {!(tests?.length) ? <PsychometricEmptyState title="No psychometric tests yet. Create your first assessment." subtitle="You can define pricing, duration, result bands, and question flows." cta={<Link href="/admin/psychometric/tests/new" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Create Psychometric Test</Link>} /> : <>
  <div className="hidden overflow-x-auto rounded-xl border bg-white md:block"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Title</th><th>Slug</th><th>Category</th><th>Price</th><th>Duration</th><th>Status</th><th>Actions</th></tr></thead><tbody>{tests.map((t: { id: string; title: string | null; slug: string | null; category: string | null; price: number | null; duration_minutes: number | null; is_active: boolean | null; is_featured: boolean | null })=><tr key={t.id} className="border-t"><td className="p-3 font-medium">{t.title}</td><td>{t.slug}</td><td>{t.category??"-"}</td><td>₹{t.price??0}</td><td>{t.duration_minutes??0}m</td><td className="space-x-1">{t.is_active?<PsychometricStatusBadge label="Active" tone="emerald"/>:<PsychometricStatusBadge label="Inactive" tone="slate"/>}{t.is_featured&&<PsychometricStatusBadge label="Featured" tone="blue"/>}</td><td className="space-x-2"><Link href={`/admin/psychometric/tests/${t.id}/edit`} className="underline">Edit</Link><Link href={`/admin/psychometric/tests/${t.id}/questions`} className="underline">Manage Questions</Link></td></tr>)}</tbody></table></div>
  <div className="grid gap-3 md:hidden">{tests.map((t: { id: string; title: string | null; slug: string | null; category: string | null; price: number | null; duration_minutes: number | null; is_active: boolean | null; is_featured: boolean | null })=><PsychometricAdminCard key={t.id}><div className="font-medium">{t.title}</div><p className="text-xs text-slate-500 break-all">{t.slug}</p><div className="mt-2 flex flex-wrap gap-2">{t.is_active?<PsychometricStatusBadge label="Active" tone="emerald"/>:<PsychometricStatusBadge label="Inactive"/>}{t.is_featured&&<PsychometricStatusBadge label="Featured" tone="blue"/>}</div><div className="mt-3 flex gap-3 text-sm"><Link href={`/admin/psychometric/tests/${t.id}/edit`} className="underline">Edit</Link><Link href={`/admin/psychometric/tests/${t.id}/questions`} className="underline">Manage Questions</Link></div></PsychometricAdminCard>)}</div></>}</div>;
}
