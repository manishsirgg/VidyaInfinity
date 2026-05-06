import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TestForm from "@/app/admin/psychometric/_components/TestForm";
import { PsychometricAdminHeader } from "@/app/admin/psychometric/_components/AdminPsychometricUI";

export default async function EditTestPage({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");
  const { data: test } = await supabase.from("psychometric_tests").select("*").eq("id", testId).single();
  return <div className="space-y-4"><PsychometricAdminHeader title="Edit Psychometric Test" description="Refine form fields and scoring setup." breadcrumbs={[{ label: "Tests", href: "/admin/psychometric/tests" }, { label: test?.title ?? "Edit" }]} /><TestForm initial={test ?? {}} testId={testId} /></div>;
}
