import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

const adminModules = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/institutes", label: "Institutes" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/refunds", label: "Refunds" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/commission", label: "Commission" },
  { href: "/admin/blogs", label: "Blogs" },
  { href: "/admin/coupons", label: "Coupons" },
  { href: "/admin/crm", label: "CRM Leads" },
  { href: "/admin/psychometric-tests", label: "Psychometric Tests" },
  { href: "/admin/profile", label: "Admin Profile" },
];

export default async function AdminDashboardPage() {
  await requireUser("admin");
  const supabase = await createClient();

  const [
    { count: users },
    { count: institutes },
    { count: orders },
    { count: refunds },
    { count: blogs },
    { count: coupons },
    { count: leads },
    { count: tests },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("institutes").select("id", { count: "exact", head: true }),
    supabase.from("course_orders").select("id", { count: "exact", head: true }),
    supabase.from("refunds").select("id", { count: "exact", head: true }).eq("status", "requested"),
    supabase.from("blogs").select("id", { count: "exact", head: true }),
    supabase.from("coupons").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("crm_leads").select("id", { count: "exact", head: true }),
    supabase.from("psychometric_tests").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded border bg-white p-4">Profiles: {users ?? 0}</div>
        <div className="rounded border bg-white p-4">Institutes: {institutes ?? 0}</div>
        <div className="rounded border bg-white p-4">Course orders: {orders ?? 0}</div>
        <Link href="/admin/refunds" className="rounded border bg-white p-4">
          Pending refunds: {refunds ?? 0}
        </Link>
        <Link href="/admin/blogs" className="rounded border bg-white p-4">
          Blogs: {blogs ?? 0}
        </Link>
        <Link href="/admin/coupons" className="rounded border bg-white p-4">
          Active coupons: {coupons ?? 0}
        </Link>
        <Link href="/admin/crm" className="rounded border bg-white p-4">
          CRM leads: {leads ?? 0}
        </Link>
        <Link href="/admin/psychometric-tests" className="rounded border bg-white p-4">
          Active tests: {tests ?? 0}
        </Link>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {adminModules.map((module) => (
          <Link key={module.href} href={module.href} className="rounded border bg-white px-4 py-3 text-sm font-medium text-slate-700">
            Open {module.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
