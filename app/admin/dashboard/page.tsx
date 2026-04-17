import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  await requireUser("admin");
  const supabase = await createClient();

  const [{ count: users }, { count: institutes }, { count: orders }] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("institutes").select("id", { count: "exact", head: true }),
    supabase.from("course_orders").select("id", { count: "exact", head: true }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded border bg-white p-4">Profiles: {users ?? 0}</div>
        <div className="rounded border bg-white p-4">Institutes: {institutes ?? 0}</div>
        <div className="rounded border bg-white p-4">Course orders: {orders ?? 0}</div>
      </div>
    </div>
  );
}
