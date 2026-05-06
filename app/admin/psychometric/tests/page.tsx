import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PsychometricTestsAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: tests } = await supabase.from("psychometric_tests").select("id,title,slug,price,category,is_active,is_featured,created_at").order("created_at",{ascending:false});
  return <div className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">Psychometric Tests</h1><Link href="/admin/psychometric/tests/new" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Create Test</Link></div>
  <div className="overflow-hidden rounded-xl border bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-left">Title</th><th>Slug</th><th>Price</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(tests??[]).map((t: { id: string; title: string | null; slug: string | null; price: number | null; category: string | null; is_active: boolean | null; is_featured: boolean | null; })=><tr key={t.id} className="border-t"><td className="p-3 font-medium">{t.title}</td><td>{t.slug}</td><td>₹{t.price??0}</td><td>{t.category??"-"}</td><td>{t.is_active?"Active":"Inactive"}</td><td className="space-x-2"><Link href={`/admin/psychometric/tests/${t.id}/edit`} className="underline">Edit</Link><Link href={`/admin/psychometric/tests/${t.id}/questions`} className="underline">Questions</Link></td></tr>)}</tbody></table></div></div>;
}
