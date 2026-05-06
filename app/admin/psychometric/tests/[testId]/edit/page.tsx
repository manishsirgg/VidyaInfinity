import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TestForm from "@/app/admin/psychometric/_components/TestForm";

export default async function EditTestPage({params}:{params:Promise<{testId:string}>}){const {testId}=await params; const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login'); const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle(); if(profile?.role!=='admin') redirect('/dashboard'); const {data:test}=await supabase.from('psychometric_tests').select('*').eq('id',testId).single(); return <div className='space-y-3'><h1 className='text-2xl font-semibold'>Edit Test</h1><div className='flex gap-3 text-sm'><Link href={`/admin/psychometric/tests/${testId}/questions`} className='underline'>Manage Questions</Link><Link href={`/psychometric-tests/${test?.slug}`} className='underline'>Preview Public Page</Link><Link href='/admin/psychometric/tests' className='underline'>Back to Tests</Link></div><TestForm initial={test??{}} testId={testId}/></div>}
