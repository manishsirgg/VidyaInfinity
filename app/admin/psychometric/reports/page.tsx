/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string }> }) {
  const params = (await searchParams) ?? {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(); if (profile?.role !== 'admin') redirect('/dashboard');
  const { data } = await supabase.from('psychometric_reports').select('*').order('created_at', { ascending: false }).limit(100);

  return <div className='space-y-4'>
    <nav className='text-xs text-slate-500'><Link href='/admin/psychometric' className='underline'>Psychometric</Link> / Reports</nav>
    <h1 className='text-2xl font-semibold'>Reports</h1>
    {params.success && <p className='rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700'>{params.success}</p>}
    {params.error && <p className='rounded border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700'>{params.error}</p>}
    {(data || []).length === 0 ? <div className='rounded border border-dashed p-6 text-sm text-slate-600'>No reports found yet.</div> :
      <div className='grid gap-2'>{(data || []).map((r: any) => <div key={r.id} className='rounded border p-3'>
        <div className='break-all text-sm'>{r.id} | score {r.total_score}/{r.max_score}</div>
        <div className='mt-2 flex flex-wrap gap-3 text-sm'>
          <Link href={`/admin/psychometric/reports/${r.id}`} className='underline'>View</Link><a href={`/api/psychometric/reports/${r.id}/download`} className='underline'>Download PDF</a>
          <form className='inline' action={`/api/admin/psychometric/reports/${r.id}/regenerate`} method='post'>
            <button className='underline'>Regenerate</button></form></div></div>)}</div>}
  </div>;
}
