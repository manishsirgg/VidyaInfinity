import { ModerationActions } from "@/components/admin/moderation-actions";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();
  const { data: institutes } = await supabase
    .from("institutes")
    .select("id,name,city,approval_status,user_id,created_at,rejection_reason")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Institutes</h1>
      <div className="mt-4 space-y-2">
        {institutes?.map((institute) => (
          <div key={institute.id} className="rounded border bg-white p-3 text-sm">
            <p>
              {institute.name} · {institute.city} · {institute.approval_status}
            </p>
            {institute.rejection_reason && <p className="text-xs text-rose-600">Reason: {institute.rejection_reason}</p>}
            <ModerationActions
              targetType="institutes"
              targetId={institute.id}
              currentStatus={institute.approval_status}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
