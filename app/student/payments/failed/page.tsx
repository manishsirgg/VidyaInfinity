import Link from "next/link";

export default function StudentPaymentFailedPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-rose-700">Payment Failed</h1>
      <p className="mt-2 text-sm text-slate-700">
        We could not confirm this payment. If money was debited, it is usually auto-reversed by your bank within the standard window.
      </p>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link href="/student/payments" className="text-brand-700 underline underline-offset-2">
          View payment history
        </Link>
        <Link href="/student/cart" className="text-brand-700 underline underline-offset-2">
          Retry checkout
        </Link>
      </div>
    </div>
  );
}
