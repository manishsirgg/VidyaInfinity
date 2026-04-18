import Link from "next/link";

type Props = {
  role: "student" | "institute" | "admin";
  status: string | null;
  rejectionReason?: string | null;
  instituteStatus?: string | null;
  instituteRejectionReason?: string | null;
};

function statusLabel(status: string | null | undefined) {
  return status ?? "pending";
}

export function ApprovalStatusPanel({ role, status, rejectionReason, instituteStatus, instituteRejectionReason }: Props) {
  const effectiveStatus = role === "institute" ? instituteStatus ?? status : status;
  const effectiveReason = role === "institute" ? instituteRejectionReason || rejectionReason : rejectionReason;
  const isRejected = effectiveStatus === "rejected";

  return (
    <div className="rounded-xl border bg-white p-5">
      <h2 className="text-lg font-semibold">Account review status</h2>
      <p className="mt-2 text-sm text-slate-700">Current status: <span className="font-medium">{statusLabel(effectiveStatus)}</span></p>
      {effectiveReason ? <p className="mt-2 text-sm text-rose-700">Rejection reason: {effectiveReason}</p> : null}
      <p className="mt-3 text-sm text-slate-600">
        {isRejected
          ? "Please correct your details/documents and resubmit."
          : "Your registration is under review. You can still update your profile/documents before approval."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/${role}/profile`} className="rounded bg-brand-600 px-3 py-2 text-sm text-white">
          Update profile & documents
        </Link>
        {role === "institute" ? (
          <Link href="/institute/kyc" className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700">
            Update institute KYC docs
          </Link>
        ) : null}
      </div>
    </div>
  );
}
