import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const { user } = await requireUser("student");
  const supabase = await createClient();

  const { data: attempts } = await supabase
    .from("test_attempts")
    .select("id,test_id,status,started_at,completed_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Tests</h1>
      <div className="mt-4 space-y-2">
        {attempts?.map((attempt) => (
          <div key={attempt.id} className="rounded border bg-white p-3 text-sm">
            Test {attempt.test_id} · {attempt.status}
          </div>
        ))}
      </div>
    </div>
  );
}
