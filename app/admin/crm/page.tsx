import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();
  const { data: leads } = await supabase.from("crm_leads").select("*").order("created_at", { ascending: false }).limit(100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin CRM</h1>
      <div className="mt-4 space-y-2">
        {leads?.map((lead) => (
          <div key={lead.id} className="rounded border bg-white p-3 text-sm">
            {lead.name} · {lead.email} · {lead.source}
          </div>
        ))}
      </div>
    </div>
  );
}
