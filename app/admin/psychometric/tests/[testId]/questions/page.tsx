import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuestionBuilder from "@/app/admin/psychometric/_components/QuestionBuilder";

export default async function QuestionsPage(){const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect('/login'); const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle(); if(profile?.role!=='admin') redirect('/dashboard'); return <QuestionBuilder />}
