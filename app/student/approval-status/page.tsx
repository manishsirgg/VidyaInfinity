import { ApprovalStatusPanel } from "@/components/account/approval-status-panel";
import { requireUser } from "@/lib/auth/get-session";

export default async function StudentApprovalStatusPage() {
  const { profile } = await requireUser("student", { requireApproved: false });
  const status = profile.approval_status ?? "pending";
  const statusMessage =
    status === "approved"
      ? "Your account is approved and fully active."
      : status === "rejected"
        ? "Your account was rejected. Please review the reason and resubmit your profile."
        : "Your account review is in progress.";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Student Account Review</h1>
      <p className="mt-2 text-sm text-slate-600">{statusMessage}</p>
      <div className="mt-6">
        <ApprovalStatusPanel role="student" status={profile.approval_status} rejectionReason={profile.rejection_reason} />
      </div>
    </div>
  );
}
