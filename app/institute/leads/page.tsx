import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();

  const { data: institute } = await supabase.from("institutes").select("id").eq("user_id", user.id).maybeSingle();

  const { data: leads } = institute
    ? await supabase
        .from("leads")
        .select("id,name,email,phone,course_id,created_at,courses!inner(institute_id)")
        .eq("courses.institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Leads</h1>
      <div className="mt-4 space-y-2">
        {leads?.map((lead) => (
          <div key={lead.id} className="rounded border bg-white p-3 text-sm">
            {lead.name} · {lead.email} · {lead.phone}
          </div>
        ))}
      </div>
    </div>
  );
}
