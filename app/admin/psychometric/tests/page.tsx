import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PsychometricAdminCard, PsychometricAdminHeader, PsychometricAdminSubnav, PsychometricEmptyState, PsychometricStatusBadge } from "../_components/AdminPsychometricUI";

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

  return <div className="space-y-5 p-3 pb-10 md:space-y-6 md:p-6"><PsychometricAdminHeader title="Psychometric Tests" description="Create and manage psychometric assessments." breadcrumbs={[{label:"Admin",href:"/admin/dashboard"},{label:"Psychometric",href:"/admin/psychometric"},{label:"Tests"}]} action={<Link href="/admin/psychometric/tests/new" className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700">Create Psychometric Test</Link>} /><PsychometricAdminSubnav currentPath="/admin/psychometric/tests" />
  <PsychometricAdminCard><form className="grid gap-3 md:grid-cols-5"><input name="q" placeholder="Search by title" defaultValue={params.q ?? ""} className="rounded-lg border p-2.5 md:col-span-2"/><select name="status" defaultValue={params.status ?? "all"} className="rounded-lg border p-2.5 md:col-span-2"><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select><button className="rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-slate-50">Apply filters</button></form></PsychometricAdminCard>
  {!(tests?.length) ? <PsychometricEmptyState title="No psychometric tests yet. Create your first assessment." subtitle="You can define pricing, duration, result bands, and question flows." cta={<Link href="/admin/psychometric/tests/new" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Create Psychometric Test</Link>} /> : <>
  <div className="hidden overflow-x-auto rounded-xl border bg-white md:block"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-slate-700"><tr><th className="p-3 text-left">Title</th><th>Slug</th><th>Category</th><th>Price</th><th>Duration</th><th>Status</th><th>Actions</th></tr></thead><tbody>{tests.map((t: { id: string; title: string | null; slug: string | null; category: string | null; price: number | null; duration_minutes: number | null; is_active: boolean | null; is_featured: boolean | null })=><tr key={t.id} className="border-t align-top"><td className="p-3 font-medium">{t.title}</td><td className="max-w-48 truncate px-1 py-3 text-slate-600">{t.slug}</td><td>{t.category??"-"}</td><td>₹{t.price??0}</td><td>{t.duration_minutes??0}m</td><td className="space-x-1">{t.is_active?<PsychometricStatusBadge label="Active" tone="emerald"/>:<PsychometricStatusBadge label="Inactive" tone="slate"/>}{t.is_featured&&<PsychometricStatusBadge label="Featured" tone="blue"/>}</td><td className="space-x-2 whitespace-nowrap"><Link href={`/admin/psychometric/tests/${t.id}/edit`} className="font-medium text-brand-700 hover:underline">Edit</Link><Link href={`/admin/psychometric/tests/${t.id}/questions`} className="font-medium text-brand-700 hover:underline">Manage Questions</Link></td></tr>)}</tbody></table></div>
  <div className="grid gap-3 md:hidden">{tests.map((t: { id: string; title: string | null; slug: string | null; category: string | null; price: number | null; duration_minutes: number | null; is_active: boolean | null; is_featured: boolean | null })=><PsychometricAdminCard key={t.id}><div className="font-medium">{t.title}</div><p className="text-xs text-slate-500 break-all">{t.slug}</p><div className="mt-2 flex flex-wrap gap-2">{t.is_active?<PsychometricStatusBadge label="Active" tone="emerald"/>:<PsychometricStatusBadge label="Inactive"/>}{t.is_featured&&<PsychometricStatusBadge label="Featured" tone="blue"/>}</div><div className="mt-3 flex gap-3 text-sm"><Link href={`/admin/psychometric/tests/${t.id}/edit`} className="underline">Edit</Link><Link href={`/admin/psychometric/tests/${t.id}/questions`} className="underline">Manage Questions</Link></div></PsychometricAdminCard>)}</div></>}</div>;
}
