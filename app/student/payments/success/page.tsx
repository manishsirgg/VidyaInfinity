import Link from "next/link";

export default function StudentPaymentSuccessPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-emerald-700">Payment Successful</h1>
      <p className="mt-2 text-sm text-slate-700">
        Your payment has been confirmed and enrollment has been activated. You can start learning now.
      </p>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link href="/student/enrollments" className="text-brand-700 underline underline-offset-2">
          Go to enrollments
        </Link>
        <Link href="/student/payments" className="text-brand-700 underline underline-offset-2">
          View payment history
        </Link>
      </div>
    </div>
  );
}
