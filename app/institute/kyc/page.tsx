import { KycUploadForm } from "@/components/institute/kyc-upload-form";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();

  const { data: institute } = await supabase
    .from("institutes")
    .select("id,status,rejection_reason")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: docs } = institute
    ? await supabase
        .from("institute_documents")
        .select("id,type,document_url,status,created_at")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] as Array<{ id: string; type: string; status: string; document_url: string }> };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute KYC</h1>
      <p className="mt-2 text-sm text-slate-600">Approval status: {institute?.status ?? "unknown"}</p>
      {institute?.rejection_reason && <p className="text-sm text-rose-600">Reason: {institute.rejection_reason}</p>}
      <KycUploadForm />
      <div className="mt-4 space-y-2">
        {docs?.map((doc) => (
          <div key={doc.id} className="rounded border bg-white p-3 text-sm">
            {doc.type} · {doc.status} · {doc.document_url}
          </div>
        ))}
      </div>
    </div>
  );
}
