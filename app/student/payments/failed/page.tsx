import Link from "next/link";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function PaymentFailedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const orderId = first(params.order_id) || first(params.razorpay_order_id);
  const paymentId = first(params.payment_id) || first(params.razorpay_payment_id);
  const reason = first(params.reason);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-rose-700">Payment failed</h1>
        <p className="mt-2 text-sm text-slate-600">We could not confirm this payment. No enrollment will be activated until payment succeeds.</p>

        <div className="mt-4 space-y-2 rounded bg-rose-50 p-4 text-sm text-rose-700">
          <p>Reason: {reason ? reason.replaceAll("_", " ") : "Payment failed or could not be verified."}</p>
          <p>Order ID: {orderId || "-"}</p>
          <p>Payment ID: {paymentId || "-"}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/courses" className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white">Retry payment</Link>
          <Link href="/contact" className="rounded border px-4 py-2 text-sm font-medium text-slate-700">Contact support</Link>
        </div>
      </div>
    </div>
  );
}
