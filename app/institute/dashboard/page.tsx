import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function InstituteDashboardPage() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();

  const { data: institute } = await supabase
    .from("institutes")
    .select("id,name,approval_status,city,rejection_reason")
    .eq("user_id", user.id)
    .maybeSingle();

  const { count: courseCount } = institute
    ? await supabase.from("courses").select("id", { count: "exact", head: true }).eq("institute_id", institute.id)
    : { count: 0 };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Dashboard</h1>
      {institute ? (
        <div className="mt-5 space-y-2 rounded border bg-white p-4 text-sm">
          <p>Name: {institute.name}</p>
          <p>City: {institute.city ?? "-"}</p>
          <p>Approval status: {institute.approval_status}</p>
          {institute.rejection_reason && <p className="text-rose-600">Reason: {institute.rejection_reason}</p>}
          <p>Total courses: {courseCount ?? 0}</p>
        </div>
      ) : (
        <p className="mt-5 text-red-600">Institute onboarding record not found.</p>
      )}
    </div>
  );
}
