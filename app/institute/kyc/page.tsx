import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();

  const { data: institute } = await supabase
    .from("institutes")
    .select("id,approval_status")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: docs } = institute
    ? await supabase
        .from("institute_documents")
        .select("id,document_type,document_url,verification_status,created_at")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute KYC</h1>
      <p className="mt-2 text-sm text-slate-600">Approval status: {institute?.approval_status ?? "unknown"}</p>
      <div className="mt-4 space-y-2">
        {docs?.map((doc) => (
          <div key={doc.id} className="rounded border bg-white p-3 text-sm">
            {doc.document_type} · {doc.verification_status} · {doc.document_url}
          </div>
        ))}
      </div>
    </div>
  );
}
