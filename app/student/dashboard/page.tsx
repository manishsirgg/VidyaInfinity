import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function StudentDashboardPage() {
  const { user, profile } = await requireUser("student");
  const supabase = await createClient();

  const [{ count: courseOrders }, { count: testOrders }, { count: enrollments }] = await Promise.all([
    supabase.from("course_orders").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("payment_status", "paid"),
    supabase
      .from("psychometric_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("payment_status", "paid"),
    supabase.from("course_enrollments").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Welcome, {profile.full_name}</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded border bg-white p-4">Paid course orders: {courseOrders ?? 0}</div>
        <div className="rounded border bg-white p-4">Paid psychometric orders: {testOrders ?? 0}</div>
        <div className="rounded border bg-white p-4">Enrollments: {enrollments ?? 0}</div>
      </div>
    </div>
  );
}
