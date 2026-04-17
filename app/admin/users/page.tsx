import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: users } = await supabase
    .from("profiles")
    .select(
      "id,full_name,email,role,approval_status,rejection_reason,organization_name,organization_type,designation,city,state,country,phone,created_at"
    )
    .order("created_at", { ascending: false });

  const userIds = users?.map((user) => user.id) ?? [];

  const { data: docs } = userIds.length
    ? await supabase
        .from("user_documents")
        .select("id,user_id,document_category,document_type,document_url,status,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const { data: institutes } = userIds.length
    ? await supabase.from("institutes").select("id,user_id").in("user_id", userIds)
    : { data: [] };

  const instituteIds = institutes?.map((institute) => institute.id) ?? [];

  const { data: instituteDocs } = instituteIds.length
    ? await supabase
        .from("institute_documents")
        .select("id,institute_id,document_url,type,status,created_at")
        .in("institute_id", instituteIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const docsByUser = new Map<string, typeof docs>();
  for (const doc of docs ?? []) {
    const list = docsByUser.get(doc.user_id) ?? [];
    list.push(doc);
    docsByUser.set(doc.user_id, list);
  }

  const instituteByUser = new Map<string, string>();
  for (const institute of institutes ?? []) {
    instituteByUser.set(institute.user_id, institute.id);
  }

  const instituteDocsByInstitute = new Map<string, typeof instituteDocs>();
  for (const doc of instituteDocs ?? []) {
    const list = instituteDocsByInstitute.get(doc.institute_id) ?? [];
    list.push(doc);
    instituteDocsByInstitute.set(doc.institute_id, list);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Users Approval</h1>
      <p className="mt-2 text-sm text-slate-600">Approve or reject newly registered users after document verification.</p>

      <div className="mt-4 space-y-3">
        {users?.map((user) => {
          const directDocs = docsByUser.get(user.id) ?? [];
          const instituteId = instituteByUser.get(user.id);
          const relatedInstituteDocs = instituteId ? instituteDocsByInstitute.get(instituteId) ?? [] : [];

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
              {(user.organization_name || user.designation) && (
                <p className="text-slate-600">
                  Organization: {user.organization_name ?? "-"} ({user.organization_type ?? "-"}) · Designation: {user.designation ?? "-"}
                </p>
              )}

              {user.rejection_reason && <p className="mt-1 text-xs text-rose-600">Reason: {user.rejection_reason}</p>}

              <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-medium text-slate-700">User documents</p>
                {directDocs.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-xs">
                    {directDocs.map((doc) => (
                      <li key={doc.id}>
                        {doc.document_category} · {doc.document_type} · {doc.status} ·{" "}
                        <a className="text-brand-700 underline" href={doc.document_url} target="_blank" rel="noreferrer">
                          view
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-rose-600">No user documents found.</p>
                )}
              </div>

              {relatedInstituteDocs.length > 0 && (
                <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs font-medium text-slate-700">Institute documents</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {relatedInstituteDocs.map((doc) => (
                      <li key={doc.id}>
                        {doc.type} · {doc.status} ·{" "}
                        <a className="text-brand-700 underline" href={doc.document_url} target="_blank" rel="noreferrer">
                          view
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ModerationActions targetType="users" targetId={user.id} currentStatus={user.approval_status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
