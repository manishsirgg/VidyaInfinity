import { ApprovalStatusPanel } from "@/components/account/approval-status-panel";
import { requireUser } from "@/lib/auth/get-session";

export default async function InstituteApprovalStatusPage() {
  const { profile, institute } = await requireUser("institute", { requireApproved: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Account Review</h1>
      <p className="mt-2 text-sm text-slate-600">Your institute onboarding is awaiting moderation.</p>
      <div className="mt-6">
        <ApprovalStatusPanel
          role="institute"
          status={profile.approval_status}
          rejectionReason={profile.rejection_reason}
          instituteStatus={institute?.status ?? null}
          instituteRejectionReason={institute?.rejection_reason ?? null}
        />
      </div>
    </div>
  );
}
