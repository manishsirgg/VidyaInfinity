import { InstituteWalletManagement } from "@/components/institute/institute-wallet-management";
import { requireUser } from "@/lib/auth/get-session";

export default async function InstituteWalletPage() {
  await requireUser("institute", { requireApproved: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Institute Wallet Balance</h1>
          <p className="mt-2 text-sm text-slate-600">Track wallet summary, payouts, ledger entries, and withdrawal requests.</p>
        </div>
      </div>

      <InstituteWalletManagement />
    </div>
  );
}
