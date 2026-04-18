import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireUser } from "@/lib/auth/get-session";
import { getSignedPrivateFileUrl } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

type UserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: "student" | "admin";
  approval_status: string | null;
  rejection_reason: string | null;
  organization_name: string | null;
  organization_type: string | null;
  designation: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  created_at: string;
};

function humanizeStatus(status: string | null | undefined) {
  const normalized = (status ?? "pending").toLowerCase();
  if (normalized === "approved") return "Already approved";
  if (normalized === "rejected") return "Waiting for resubmission";
  return "No active pending submission";
}

function getLatestPendingDocsByCategory(docs: UserDocWithLink[]) {
  const latestByCategory = new Map<string, UserDocWithLink>();

  for (const doc of docs) {
    if (doc.status !== "pending") continue;
    if (!latestByCategory.has(doc.document_category)) {
      latestByCategory.set(doc.document_category, doc);
    }
  }

  return Array.from(latestByCategory.values());
}

export default async function Page() {
  await requireUser("admin");
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    throw new Error(admin.error);
  }

  const supabase = admin.data;

  const { data: users } = await supabase
    .from("profiles")
    .select(
      "id,full_name,email,role,approval_status,rejection_reason,organization_name,organization_type,designation,city,state,country,phone,created_at"
    )
    .in("role", ["student", "admin"])
    .order("created_at", { ascending: false });

  const userIds = users?.map((user) => user.id) ?? [];

  const { data: docs } = userIds.length
    ? await supabase
        .from("user_documents")
        .select("id,user_id,document_category,document_type,document_url,status,rejection_reason,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const { data: details } = userIds.length
    ? await supabase
        .from("user_additional_details")
        .select("user_id,dob,gender,address_line_1,address_line_2,postal_code,alternate_phone")
        .in("user_id", userIds)
    : { data: [] };

  const docsWithLinks: UserDocWithLink[] = await Promise.all(
    (docs ?? []).map(async (doc) => ({
      ...doc,
      signedUrl: await getSignedPrivateFileUrl({
        bucket: "user-documents",
        fileRef: doc.document_url,
      }),
    }))
  );

  const docsByUser = new Map<string, UserDocWithLink[]>();
  for (const doc of docsWithLinks) {
    const list = docsByUser.get(doc.user_id) ?? [];
    list.push(doc);
    docsByUser.set(doc.user_id, list);
  }

  const detailsByUser = new Map((details ?? []).map((item) => [item.user_id, item]));
  const pendingUsers = ((users ?? []) as UserRow[]).filter((item) => item.approval_status === "pending");
  const reviewedUsers = ((users ?? []) as UserRow[]).filter((item) => item.approval_status !== "pending");

  function renderDoc(doc: UserDocWithLink) {
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

  function renderUser(user: UserRow) {
    const allDocs = docsByUser.get(user.id) ?? [];
    const activeDocs = getLatestPendingDocsByCategory(allDocs);
    const activeDocIds = new Set(activeDocs.map((doc) => doc.id));
    const historicalDocs = allDocs.filter((doc) => !activeDocIds.has(doc.id));
    const personal = detailsByUser.get(user.id);

    const requiresAuthorization = user.role === "admin";
    const hasIdentityPending = activeDocs.some((doc) => doc.document_category === "identity");
    const hasAuthorizationPending = !requiresAuthorization || activeDocs.some((doc) => doc.document_category === "authorization");

    const hasActivePendingSubmission = user.approval_status === "pending" && hasIdentityPending && hasAuthorizationPending;

    return (
      <div key={user.id} className="rounded border bg-white p-4 text-sm">
        <p className="font-medium">
          {user.full_name} · {user.role} · {user.approval_status}
        </p>
        <p className="text-slate-600">{user.email}</p>
        <p className="text-slate-600">
          {user.city ?? "-"}, {user.state ?? "-"}, {user.country ?? "-"}
        </p>
        <p className="text-slate-600">Phone: {user.phone ?? "-"}</p>
        <p className="text-slate-600">Submitted: {new Date(user.created_at).toLocaleString()}</p>
        {(user.organization_name || user.designation) && (
          <p className="text-slate-600">
            Organization: {user.organization_name ?? "-"} ({user.organization_type ?? "-"}) · Designation: {user.designation ?? "-"}
          </p>
        )}

        {personal ? (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            DOB: {personal.dob ?? "-"} · Gender: {personal.gender ?? "-"}
            <br />
            Alternate phone: {personal.alternate_phone ?? "-"}
            <br />
            Address: {personal.address_line_1 ?? "-"} {personal.address_line_2 ?? ""} · Postal code: {personal.postal_code ?? "-"}
          </div>
        ) : null}

        {user.rejection_reason && <p className="mt-1 text-xs text-rose-600">Reason: {user.rejection_reason}</p>}

        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
          <p className="text-xs font-medium text-slate-700">Active documents under review</p>
          {activeDocs.length > 0 ? <ul className="mt-1 space-y-1 text-xs">{activeDocs.map(renderDoc)}</ul> : <p className="mt-1 text-xs text-slate-500">No active pending submission.</p>}
        </div>

        {historicalDocs.length > 0 ? (
          <details className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">Document history ({historicalDocs.length})</summary>
            <ul className="mt-1 space-y-1 text-xs">{historicalDocs.map(renderDoc)}</ul>
          </details>
        ) : null}

        <ModerationActions
          targetType="users"
          targetId={user.id}
          currentStatus={user.approval_status ?? "pending"}
          isActionable={hasActivePendingSubmission}
          disabledReason={hasActivePendingSubmission ? undefined : humanizeStatus(user.approval_status)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Users Approval</h1>
      <p className="mt-2 text-sm text-slate-600">Approve or reject newly registered students/admins after document verification.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded border bg-white p-3 text-sm">Pending users: {pendingUsers.length}</div>
        <div className="rounded border bg-white p-3 text-sm">Reviewed users: {reviewedUsers.length}</div>
        <div className="rounded border bg-white p-3 text-sm">Total moderated users: {(users ?? []).length}</div>
      </div>

      <h2 className="mt-6 text-lg font-semibold">Pending queue</h2>
      <div className="mt-3 space-y-3">{pendingUsers.map(renderUser)}</div>

      {reviewedUsers.length > 0 ? <h2 className="mt-8 text-lg font-semibold">Reviewed users</h2> : null}
      <div className="mt-3 space-y-3">{reviewedUsers.map(renderUser)}</div>
    </div>
  );
}
