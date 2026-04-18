import { ApprovalStatusPanel } from "@/components/account/approval-status-panel";
import { requireUser } from "@/lib/auth/get-session";

export default async function AdminApprovalStatusPage() {
  const { profile } = await requireUser("admin", { requireApproved: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Account Review</h1>
      <p className="mt-2 text-sm text-slate-600">Your admin account is awaiting moderation.</p>
      <div className="mt-6">
        <ApprovalStatusPanel role="admin" status={profile.approval_status} rejectionReason={profile.rejection_reason} />
      </div>
    </div>
  );
}
