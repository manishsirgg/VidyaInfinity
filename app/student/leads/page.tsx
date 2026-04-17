import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { profile } = await requireUser("student");
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("id,name,email,phone,course_id,created_at")
    .eq("email", profile.email)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Leads</h1>
      <div className="mt-4 space-y-2">
        {leads?.map((lead) => (
          <div key={lead.id} className="rounded border bg-white p-3 text-sm">
            {lead.name} · {lead.email} · course {lead.course_id}
          </div>
        ))}
      </div>
    </div>
  );
}
