import Link from "next/link";

import { PaymentPendingStatus } from "@/components/student/payment-pending-status";

export default function StudentPaymentPendingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Payment Pending</h1>
      <p className="mt-2 text-sm text-slate-600">
        We received your payment attempt and are waiting for final confirmation from Razorpay.
      </p>

      <div className="mt-6">
        <PaymentPendingStatus />
      </div>

      <div className="mt-6 text-sm">
        <Link href="/student/payments" className="text-brand-700 underline underline-offset-2">
          View payment history
        </Link>
      </div>
    </div>
  );
}
