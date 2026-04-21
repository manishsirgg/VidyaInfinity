export type CoursePaymentState = "success" | "pending" | "failed";
export type CoursePollingState = "pending" | "paid" | "failed" | "enrolled";

export function normalizePaymentStatus(status: string | null | undefined): "created" | "paid" | "failed" {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (["paid", "captured", "success", "confirmed"].includes(normalized)) return "paid";
  if (normalized === "failed") return "failed";
  return "created";
}

export function resolveCoursePollingState({ paymentStatus, enrolled }: { paymentStatus: string | null | undefined; enrolled: boolean }): CoursePollingState {
  const normalized = normalizePaymentStatus(paymentStatus);
  if (enrolled) return "enrolled";
  if (normalized === "paid") return "paid";
  if (normalized === "failed") return "failed";
  return "pending";
}

export function resolveCourseVerifyState({ paymentStatus, enrolled }: { paymentStatus: string | null | undefined; enrolled: boolean }): CoursePaymentState {
  const status = resolveCoursePollingState({ paymentStatus, enrolled });
  if (status === "failed") return "failed";
  if (status === "pending") return "pending";
  return "success";
}

export function buildCoursePaymentRedirect({
  state,
  orderId,
  paymentId,
  reason,
}: {
  state: CoursePaymentState;
  orderId?: string | null;
  paymentId?: string | null;
  reason?: string | null;
}) {
  const pathname =
    state === "success"
      ? "/student/payments/success"
      : state === "failed"
        ? "/student/payments/failed"
        : "/student/payments/pending";

  const params = new URLSearchParams();
  if (orderId) {
    params.set("order_id", orderId);
    params.set("razorpay_order_id", orderId);
  }
  if (paymentId) params.set("payment_id", paymentId);
  if (reason) params.set("reason", reason);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
