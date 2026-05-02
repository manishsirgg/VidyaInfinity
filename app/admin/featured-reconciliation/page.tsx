import { requireUser } from "@/lib/auth/get-session";
import Link from "next/link";

export default async function Page() {
  await requireUser("admin");
  return (
    <div className="mx-auto max-w-7xl p-6">
      <h1 className="text-2xl font-semibold">Featured Reconciliation</h1>
      <p className="mt-2 text-sm text-slate-600">Review pending and mismatched featured payments. Use this only for verified payment recovery, complimentary grant, or technical correction. This action will be logged.</p>
      <p className="mt-4 text-sm">Use <code>GET /api/admin/featured-reconciliation</code> for data and action APIs for reconcile/manual/cancel/extend.</p>
      <Link href="/admin/featured-listings" className="mt-4 inline-block text-blue-600 underline">Go to Featured Listings</Link>
    </div>
  );
}
