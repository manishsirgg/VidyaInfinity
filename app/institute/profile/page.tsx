import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("institute");
  const supabase = await createClient();
  const { data: institute } = await supabase
    .from("institutes")
    .select("name,city,description,website_url,approval_status")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Profile</h1>
      {institute ? (
        <div className="mt-4 rounded border bg-white p-4 text-sm space-y-2">
          <p>Name: {institute.name}</p>
          <p>City: {institute.city ?? "-"}</p>
          <p>Website: {institute.website_url ?? "-"}</p>
          <p>Approval: {institute.approval_status}</p>
          <p>Description: {institute.description ?? "-"}</p>
        </div>
      ) : (
        <p className="mt-4 text-red-600">Institute record not found.</p>
      )}
    </div>
  );
}
