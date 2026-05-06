import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuestionBuilder from "@/app/admin/psychometric/_components/QuestionBuilder";

export default async function QuestionsPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");
  const { data: test } = await supabase.from("psychometric_tests").select("title").eq("id", testId).maybeSingle();
  return <div className="p-2 md:p-4"><QuestionBuilder testTitle={test?.title ?? "Psychometric Test"} /></div>;
}
