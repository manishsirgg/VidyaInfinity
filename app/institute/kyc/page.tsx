import { KycUploadForm } from "@/components/institute/kyc-upload-form";
import { requireUser } from "@/lib/auth/get-session";
import { getInstituteApprovalSubtypeLabel } from "@/lib/constants/institute-documents";
import { createClient } from "@/lib/supabase/server";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";

export default async function Page() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();

  const { data: institute } = await supabase
    .from("institutes")
    .select("id,status,rejection_reason")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: docs } = institute
      ? await supabase
        .from("institute_documents")
        .select("id,type,subtype,document_url,status,created_at")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] as Array<{ id: string; type: string; subtype: string | null; status: string; document_url: string }> };

  const docsWithLinks = await Promise.all(
    (docs ?? []).map(async (doc) => ({
      ...doc,
      signedUrl: await getSignedPrivateFileUrl({
        bucket: "institute-documents",
        fileRef: doc.document_url,
      }),
    }))
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute KYC</h1>
      <p className="mt-2 text-sm text-slate-600">Approval status: {institute?.status ?? "unknown"}</p>
      {institute?.rejection_reason && <p className="text-sm text-rose-600">Reason: {institute.rejection_reason}</p>}
      <KycUploadForm />
      <div className="mt-4 space-y-2">
        {docsWithLinks.map((doc) => (
          <div key={doc.id} className="rounded border bg-white p-3 text-sm">
            {doc.type} · {getInstituteApprovalSubtypeLabel(doc.subtype)} · {doc.status} ·{" "}
            {doc.signedUrl ? (
              <a className="text-brand-700 underline" href={doc.signedUrl} target="_blank" rel="noreferrer">
                view
              </a>
            ) : (
              <span className="text-rose-600">Unavailable</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
