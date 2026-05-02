import { FeaturedReconciliationPanel } from "@/components/admin/featured-reconciliation-panel";
import { requireUser } from "@/lib/auth/get-session";

export default async function Page() {
  await requireUser("admin");
  return (
    <div className="vi-page">
      <h1 className="vi-page-title">Featured Subscription Reconciliation</h1>
      <p className="vi-page-subtitle mt-2 text-slate-600">Recover Razorpay-paid featured subscriptions, detect mismatches, and manage manual corrections.</p>
      <FeaturedReconciliationPanel />
    </div>
  );
}
