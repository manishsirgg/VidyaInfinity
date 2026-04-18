import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: institutes } = await supabase
    .from("institutes")
    .select(
      "id,user_id,name,status,rejection_reason,verified,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,website_url,established_year,total_students,total_staff,created_at"
    )
    .order("created_at", { ascending: false });

  const userIds = institutes?.map((item) => item.user_id) ?? [];

  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id,full_name,email,phone,city,state,country,designation,approval_status,rejection_reason")
        .in("id", userIds)
    : { data: [] };

  const instituteIds = institutes?.map((item) => item.id) ?? [];

  const { data: instituteDocs } = instituteIds.length
    ? await supabase
        .from("institute_documents")
        .select("id,institute_id,type,document_url,status,created_at")
        .in("institute_id", instituteIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const { data: userDocs } = userIds.length
    ? await supabase
        .from("user_documents")
        .select("id,user_id,document_category,document_type,document_url,status,rejection_reason,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const instituteDocsWithLinks = await Promise.all(
    (instituteDocs ?? []).map(async (doc) => ({
      ...doc,
      signedUrl: await getSignedPrivateFileUrl({ bucket: "institute-documents", fileRef: doc.document_url }),
    }))
  );

  const userDocsWithLinks = await Promise.all(
    (userDocs ?? []).map(async (doc) => ({
      ...doc,
      signedUrl: await getSignedPrivateFileUrl({ bucket: "user-documents", fileRef: doc.document_url }),
    }))
  );

  const profileByUserId = new Map((profiles ?? []).map((item) => [item.id, item]));

  const instituteDocsByInstitute = new Map<string, typeof instituteDocsWithLinks>();
  for (const doc of instituteDocsWithLinks) {
    const list = instituteDocsByInstitute.get(doc.institute_id) ?? [];
    list.push(doc);
    instituteDocsByInstitute.set(doc.institute_id, list);
  }

  const userDocsByUser = new Map<string, typeof userDocsWithLinks>();
  for (const doc of userDocsWithLinks) {
    const list = userDocsByUser.get(doc.user_id) ?? [];
    list.push(doc);
    userDocsByUser.set(doc.user_id, list);
  }

  const pendingInstitutes = (institutes ?? []).filter((institute) => institute.status === "pending");
  const rejectedInstitutes = (institutes ?? []).filter((institute) => institute.status === "rejected");

  type InstituteRow = NonNullable<typeof institutes>[number];

  function renderInstitute(institute: InstituteRow) {
    const ownerProfile = profileByUserId.get(institute.user_id);
    const instituteSpecificDocs = instituteDocsByInstitute.get(institute.id) ?? [];
    const ownerDocs = userDocsByUser.get(institute.user_id) ?? [];

    return (
      <div key={institute.id} className="rounded border bg-white p-4 text-sm">
        <p className="font-medium">
          {institute.name} · {institute.status}
        </p>
        <p className="text-slate-600">Owner: {ownerProfile?.full_name ?? "-"} ({ownerProfile?.email ?? "-"})</p>
        <p className="text-slate-600">
          {ownerProfile?.city ?? "-"}, {ownerProfile?.state ?? "-"}, {ownerProfile?.country ?? "-"}
        </p>
        <p className="text-slate-600">Phone: {ownerProfile?.phone ?? "-"} · Designation: {ownerProfile?.designation ?? "-"}</p>
        <p className="text-slate-600">Submitted: {new Date(institute.created_at).toLocaleString()}</p>
        <p className="text-slate-600">Profile approval: {ownerProfile?.approval_status ?? "-"} · Verified: {institute.verified ? "Yes" : "No"}</p>

        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          Legal entity: {institute.legal_entity_name ?? "-"} · Org type: {institute.organization_type ?? "-"}
          <br />
          Registration #: {institute.registration_number ?? "-"} · Accreditation #: {institute.accreditation_affiliation_number ?? "-"}
          <br />
          Website: {institute.website_url ?? "-"} · Established: {institute.established_year ?? "-"}
          <br />
          Students: {institute.total_students ?? "-"} · Staff: {institute.total_staff ?? "-"}
        </div>

        {institute.rejection_reason ? <p className="mt-1 text-xs text-rose-600">Institute reason: {institute.rejection_reason}</p> : null}
        {ownerProfile?.rejection_reason ? <p className="mt-1 text-xs text-rose-600">Profile reason: {ownerProfile.rejection_reason}</p> : null}

        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-medium text-slate-700">Institute documents</p>
          {instituteSpecificDocs.length > 0 ? (
            <ul className="mt-1 space-y-1 text-xs">
              {instituteSpecificDocs.map((doc) => (
                <li key={doc.id}>
                  {doc.type} · {doc.status} ·{" "}
                  {doc.signedUrl ? (
                    <a className="text-brand-700 underline" href={doc.signedUrl} target="_blank" rel="noreferrer">
                      view
                    </a>
                  ) : (
                    <span className="text-rose-600">Unavailable</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-rose-600">No institute documents found.</p>
          )}
        </div>

        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-medium text-slate-700">Owner identity documents</p>
          {ownerDocs.length > 0 ? (
            <ul className="mt-1 space-y-1 text-xs">
              {ownerDocs.map((doc) => (
                <li key={doc.id}>
                  {doc.document_category} · {doc.document_type} · {doc.status} ·{" "}
                  {doc.signedUrl ? (
                    <a className="text-brand-700 underline" href={doc.signedUrl} target="_blank" rel="noreferrer">
                      view
                    </a>
                  ) : (
                    <span className="text-rose-600">Unavailable</span>
                  )}
                  {doc.rejection_reason ? <span className="text-rose-600"> · {doc.rejection_reason}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-rose-600">No owner documents found.</p>
          )}
        </div>

        <ModerationActions targetType="institutes" targetId={institute.id} currentStatus={institute.status} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Institutes Approval</h1>
      <p className="mt-2 text-sm text-slate-600">Review institute registrations, profile ownership, and institute compliance documents.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded border bg-white p-3 text-sm">Pending institutes: {pendingInstitutes.length}</div>
        <div className="rounded border bg-white p-3 text-sm">Rejected institutes: {rejectedInstitutes.length}</div>
        <div className="rounded border bg-white p-3 text-sm">Total institutes: {(institutes ?? []).length}</div>
      </div>

      <h2 className="mt-6 text-lg font-semibold">Pending queue</h2>
      <div className="mt-3 space-y-3">{pendingInstitutes.map(renderInstitute)}</div>

      {rejectedInstitutes.length > 0 ? <h2 className="mt-8 text-lg font-semibold">Rejected (resubmission-ready)</h2> : null}
      <div className="mt-3 space-y-3">{rejectedInstitutes.map(renderInstitute)}</div>
    </div>
  );
}
