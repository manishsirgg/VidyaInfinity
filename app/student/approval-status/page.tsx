import { ApprovalStatusPanel } from "@/components/account/approval-status-panel";
import { requireUser } from "@/lib/auth/get-session";

export default async function StudentApprovalStatusPage() {
  const { profile } = await requireUser("student", { requireApproved: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Account Review</h1>
      <p className="mt-2 text-sm text-slate-600">Your account is not fully approved yet.</p>
      <div className="mt-6">
        <ApprovalStatusPanel role="student" status={profile.approval_status} rejectionReason={profile.rejection_reason} />
      </div>
    </div>
  );
}
