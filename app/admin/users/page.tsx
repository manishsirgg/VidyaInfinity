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
        .from("user_verification_documents")
        .select("id,user_id,document_category,document_type,document_url,verification_status,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const docsByUser = new Map<string, typeof docs>();
  for (const doc of docs ?? []) {
    const list = docsByUser.get(doc.user_id) ?? [];
    list.push(doc);
    docsByUser.set(doc.user_id, list);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Users Approval</h1>
      <p className="mt-2 text-sm text-slate-600">Approve or reject newly registered users after document verification.</p>

      <div className="mt-4 space-y-3">
        {users?.map((user) => (
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
              <p className="text-xs font-medium text-slate-700">Uploaded documents</p>
              {(docsByUser.get(user.id) ?? []).length > 0 ? (
                <ul className="mt-1 space-y-1 text-xs">
                  {(docsByUser.get(user.id) ?? []).map((doc) => (
                    <li key={doc.id}>
                      {doc.document_category} · {doc.document_type} · {doc.verification_status} · {" "}
                      <a className="text-brand-700 underline" href={doc.document_url} target="_blank" rel="noreferrer">
                        view
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-rose-600">No documents found.</p>
              )}
            </div>

            <ModerationActions targetType="users" targetId={user.id} currentStatus={user.approval_status} />
          </div>
        ))}
      </div>
    </div>
  );
}
