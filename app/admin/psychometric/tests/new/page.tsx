import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TestForm from "@/app/admin/psychometric/_components/TestForm";

export default async function NewTestPage(){const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login'); const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle(); if(profile?.role!=='admin') redirect('/dashboard'); return <div><h1 className='text-2xl font-semibold mb-4'>Create Psychometric Test</h1><TestForm /></div>}
