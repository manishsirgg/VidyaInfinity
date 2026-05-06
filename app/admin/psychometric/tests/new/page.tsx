import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TestForm from "@/app/admin/psychometric/_components/TestForm";
import { PsychometricAdminHeader, PsychometricAdminSubnav } from "@/app/admin/psychometric/_components/AdminPsychometricUI";

export default async function NewTestPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");
  return <div className="space-y-5 p-3 pb-10 md:p-6"><PsychometricAdminHeader title="Create Psychometric Test" description="Set details, scoring and instructions before adding questions." breadcrumbs={[{ label: "Tests", href: "/admin/psychometric/tests" }, { label: "Create" }]} /><PsychometricAdminSubnav currentPath="/admin/psychometric/tests" /><TestForm /></div>;
}
