import { ModerationActions } from "@/components/admin/moderation-actions";
import { ModerationPagination } from "@/components/admin/moderation-pagination";
import { requireUser } from "@/lib/auth/get-session";
import { getInstituteApprovalSubtypeLabel } from "@/lib/constants/institute-documents";
import { getOrganizationTypeLabel } from "@/lib/constants/organization-types";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type InstituteRow = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  rejection_reason: string | null;
  verified: boolean;
  organization_type: string | null;
  legal_entity_name: string | null;
  registration_number: string | null;
  accreditation_affiliation_number: string | null;
  website_url: string | null;
  established_year: number | null;
  total_students: number | null;
  total_staff: number | null;
  created_at: string;
};

type InstituteDocWithLink = {
  id: string;
  institute_id: string;
  type: string;
  subtype: string | null;
  document_url: string;
  status: string;
  created_at: string;
  signedUrl: string | null;
};

type UserDocWithLink = {
  id: string;
  user_id: string;
  document_category: string;
  document_type: string;
  document_url: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  signedUrl: string | null;
};

function disabledReasonFromStatus(status: string) {
  if (status === "approved") return "Already approved";
  if (status === "rejected") return "Waiting for resubmission";
  return "No active pending submission";
}

const PAGE_SIZE = 10;

function parsePage(value: string | undefined) {
  const page = Number(value);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireUser("admin");
  const { page } = await searchParams;
  const currentPage = parsePage(page);
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    throw new Error(admin.error);
  }
  const supabase = admin.data;

  const { data: institutes } = await supabase
    .from("institutes")
    .select(
      "id,user_id,name,status,rejection_reason,verified,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,website_url,established_year,total_students,total_staff,created_at"
    )
    .order("created_at", { ascending: false });

  const typedInstitutes = (institutes ?? []) as InstituteRow[];
  const userIds = typedInstitutes.map((item) => item.user_id);
  const instituteIds = typedInstitutes.map((item) => item.id);

  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id,full_name,email,phone,city,state,country,designation,approval_status,rejection_reason")
        .in("id", userIds)
    : { data: [] };

  const { data: instituteDocs } = instituteIds.length
    ? await supabase
        .from("institute_documents")
        .select("id,institute_id,type,subtype,document_url,status,created_at")
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

  const instituteDocsWithLinks: InstituteDocWithLink[] = await Promise.all(
    (instituteDocs ?? []).map(async (doc) => ({
      ...doc,
      signedUrl: await getSignedPrivateFileUrl({ bucket: "institute-documents", fileRef: doc.document_url }),
    }))
  );

  const userDocsWithLinks: UserDocWithLink[] = await Promise.all(
    (userDocs ?? []).map(async (doc) => ({
      ...doc,
      signedUrl: await getSignedPrivateFileUrl({ bucket: "user-documents", fileRef: doc.document_url }),
    }))
  );

  const profileByUserId = new Map((profiles ?? []).map((item) => [item.id, item]));

  const instituteDocsByInstitute = new Map<string, InstituteDocWithLink[]>();
  for (const doc of instituteDocsWithLinks) {
    const list = instituteDocsByInstitute.get(doc.institute_id) ?? [];
    list.push(doc);
    instituteDocsByInstitute.set(doc.institute_id, list);
  }

  const userDocsByUser = new Map<string, UserDocWithLink[]>();
  for (const doc of userDocsWithLinks) {
    const list = userDocsByUser.get(doc.user_id) ?? [];
    list.push(doc);
    userDocsByUser.set(doc.user_id, list);
  }

  const pendingInstitutes = typedInstitutes.filter((institute) => institute.status === "pending");
  const reviewedInstitutes = typedInstitutes.filter((institute) => institute.status !== "pending");
  const sortedInstitutes = [...pendingInstitutes, ...reviewedInstitutes];

  const totalInstitutes = sortedInstitutes.length;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedInstitutes = sortedInstitutes.slice(startIndex, startIndex + PAGE_SIZE);
  const paginatedPendingInstitutes = paginatedInstitutes.filter((institute) => institute.status === "pending");
  const paginatedReviewedInstitutes = paginatedInstitutes.filter((institute) => institute.status !== "pending");

  function renderInstituteDoc(doc: InstituteDocWithLink) {
    return (
      <li key={doc.id}>
        {doc.type} · {getInstituteApprovalSubtypeLabel(doc.subtype)} · {doc.status} ·{" "}
        {doc.signedUrl ? (
          <a className="text-brand-700 underline" href={doc.signedUrl} target="_blank" rel="noreferrer">
            view
          </a>
        ) : (
          <span className="text-rose-600">Unavailable</span>
        )}
      </li>
    );
  }

  function renderUserDoc(doc: UserDocWithLink) {
    return (
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
    );
  }

  function renderInstitute(institute: InstituteRow) {
    const ownerProfile = profileByUserId.get(institute.user_id);
    const instituteAllDocs = instituteDocsByInstitute.get(institute.id) ?? [];
    const ownerAllDocs = userDocsByUser.get(institute.user_id) ?? [];

    const activeInstituteDoc = instituteAllDocs.find((doc) => doc.status === "pending") ?? null;
    const activeOwnerIdentityDoc = ownerAllDocs.find((doc) => doc.status === "pending" && doc.document_category === "identity") ?? null;

    const instituteHistory = instituteAllDocs.filter((doc) => doc.id !== activeInstituteDoc?.id);
    const ownerDocHistory = ownerAllDocs.filter((doc) => doc.id !== activeOwnerIdentityDoc?.id);

    const hasActivePendingSubmission =
      institute.status === "pending" &&
      ownerProfile?.approval_status === "pending" &&
      Boolean(activeInstituteDoc) &&
      Boolean(activeOwnerIdentityDoc);

    return (
      <div key={institute.id} className="rounded border bg-white p-4 text-sm">
        <p className="font-medium">
          {institute.name} · {institute.status}
        </p>
        <p className="text-slate-600">
          Owner: {ownerProfile?.full_name ?? "-"} ({ownerProfile?.email ?? "-"})
        </p>
        <p className="text-slate-600">
          {ownerProfile?.city ?? "-"}, {ownerProfile?.state ?? "-"}, {ownerProfile?.country ?? "-"}
        </p>
        <p className="text-slate-600">Phone: {ownerProfile?.phone ?? "-"} · Designation: {ownerProfile?.designation ?? "-"}</p>
        <p className="text-slate-600">Submitted: {new Date(institute.created_at).toLocaleString()}</p>
        <p className="text-slate-600">
          Profile approval: {ownerProfile?.approval_status ?? "-"} · Verified: {institute.verified ? "Yes" : "No"}
        </p>

        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          Legal entity: {institute.legal_entity_name ?? "-"} · Org type: {getOrganizationTypeLabel(institute.organization_type) ?? "-"}
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
          <p className="text-xs font-medium text-slate-700">Active institute document under review</p>
          {activeInstituteDoc ? <ul className="mt-1 space-y-1 text-xs">{renderInstituteDoc(activeInstituteDoc)}</ul> : <p className="mt-1 text-xs text-slate-500">No active pending institute document.</p>}
        </div>

        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-medium text-slate-700">Active owner identity document under review</p>
          {activeOwnerIdentityDoc ? <ul className="mt-1 space-y-1 text-xs">{renderUserDoc(activeOwnerIdentityDoc)}</ul> : <p className="mt-1 text-xs text-slate-500">No active pending owner identity document.</p>}
        </div>

        {instituteHistory.length > 0 || ownerDocHistory.length > 0 ? (
          <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">Document history</summary>
            {instituteHistory.length > 0 ? (
              <div className="mt-1">
                <p className="text-xs font-medium text-slate-600">Institute history</p>
                <ul className="mt-1 space-y-1 text-xs">{instituteHistory.map(renderInstituteDoc)}</ul>
              </div>
            ) : null}
            {ownerDocHistory.length > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-medium text-slate-600">Owner history</p>
                <ul className="mt-1 space-y-1 text-xs">{ownerDocHistory.map(renderUserDoc)}</ul>
              </div>
            ) : null}
          </details>
        ) : null}

        <ModerationActions
          targetType="institutes"
          targetId={institute.id}
          currentStatus={institute.status}
          isActionable={hasActivePendingSubmission}
          disabledReason={hasActivePendingSubmission ? undefined : disabledReasonFromStatus(institute.status)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Institutes Approval</h1>
      <p className="mt-2 text-sm text-slate-600">Review institute registrations, profile ownership, and institute compliance documents.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded border bg-white p-3 text-sm">Pending institutes: {pendingInstitutes.length}</div>
        <div className="rounded border bg-white p-3 text-sm">Reviewed institutes: {reviewedInstitutes.length}</div>
        <div className="rounded border bg-white p-3 text-sm">Total institutes: {typedInstitutes.length}</div>
      </div>

      <h2 className="mt-6 text-lg font-semibold">Pending queue</h2>
      <div className="mt-3 space-y-3">{paginatedPendingInstitutes.map(renderInstitute)}</div>
      {paginatedPendingInstitutes.length === 0 ? <p className="mt-3 rounded border bg-white p-3 text-sm text-slate-600">No pending institutes on this page.</p> : null}

      {paginatedReviewedInstitutes.length > 0 ? <h2 className="mt-8 text-lg font-semibold">Reviewed institutes</h2> : null}
      <div className="mt-3 space-y-3">{paginatedReviewedInstitutes.map(renderInstitute)}</div>

      <ModerationPagination page={currentPage} pageSize={PAGE_SIZE} totalItems={totalInstitutes} pathname="/admin/institutes" query={{}} />
    </div>
  );
}
