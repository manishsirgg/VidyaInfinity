import { PendingPaymentClient } from "./pending-payment-client";

type SearchParams = Record<string, string | string[] | undefined>;

function toFirstString(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function PendingPaymentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const orderId = toFirstString(params.order_id) || toFirstString(params.razorpay_order_id);
  const razorpayOrderId = toFirstString(params.razorpay_order_id) || orderId;
  const paymentId = toFirstString(params.payment_id) || toFirstString(params.razorpay_payment_id);
  const reason = toFirstString(params.reason);
  const paymentKindRaw = toFirstString(params.kind).trim().toLowerCase();
  const paymentKind = paymentKindRaw === "webinar" || paymentKindRaw === "psychometric" ? paymentKindRaw : "course";

  return (
    <PendingPaymentClient
      orderId={orderId}
      razorpayOrderId={razorpayOrderId}
      paymentId={paymentId}
      initialReason={reason}
      paymentKind={paymentKind}
    />
  );
}
