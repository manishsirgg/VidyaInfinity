"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function CoursePurchaseCard({
  courseId,
  courseTitle,
  feeAmount,
  enrollmentOpen = true,
  enrollmentBlockedMessage = "This institute is not currently accepting enrollments.",
  hasActiveEnrollment = false,
  activeEnrollmentEndsAt = null,
}: {
  courseId: string;
  courseTitle: string;
  feeAmount: number;
  enrollmentOpen?: boolean;
  enrollmentBlockedMessage?: string;
  hasActiveEnrollment?: boolean;
  activeEnrollmentEndsAt?: string | null;
}) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [savedBusy, setSavedBusy] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const router = useRouter();
  const checkoutResolvedRef = useRef(false);
  const purchaseDisabled = !enrollmentOpen || hasActiveEnrollment;
  const enrollmentActiveLabel = hasActiveEnrollment
    ? activeEnrollmentEndsAt
      ? `Enrollment active until ${new Date(activeEnrollmentEndsAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.`
      : "Enrollment Active"
    : null;

  useEffect(() => {
    let ignore = false;

    async function loadState() {
      const savedRes = await fetch("/api/student/saved-courses", { method: "GET" });

      if (!ignore && savedRes.ok) {
        const body = await savedRes.json().catch(() => null);
        setIsSaved(Boolean(body?.items?.some((item: { course_id: string }) => item.course_id === courseId)));
      }
    }

    loadState().catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [courseId]);

  async function enrollNow() {
    if (purchaseDisabled) {
      setState("error");
      setMessage(enrollmentActiveLabel ?? enrollmentBlockedMessage);
      return;
    }

    setState("loading");
    setMessage("");

    try {
      const normalizedCouponCode = couponCode.trim().toUpperCase();
      const requestBody: { courseId: string; couponCode?: string } = { courseId };
      if (normalizedCouponCode) {
        requestBody.couponCode = normalizedCouponCode;
      }

      const createOrderResponse = await fetch("/api/payments/course/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const createOrderBody = await createOrderResponse.json().catch(() => null);
      if (createOrderBody?.freeCourse && createOrderBody?.enrolled) {
        setState("success");
        setMessage(createOrderBody?.message ?? "Enrollment confirmed for this free course.");
        return;
      }

      if (!createOrderResponse.ok || !createOrderBody?.order?.id) {
        setState("error");
        setMessage(createOrderBody?.error ?? "Unable to start checkout.");
        return;
      }

      if (!window.Razorpay) {
        setState("error");
        setMessage("Payment SDK failed to load. Refresh and try again.");
        return;
      }

      const order = createOrderBody.order as { id: string; amount: number; currency: string };
      const pendingUrl = `/student/payments/pending?order_id=${encodeURIComponent(order.id)}&razorpay_order_id=${encodeURIComponent(order.id)}`;
      checkoutResolvedRef.current = false;

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "Vidya Infinity",
        description: `Enrollment: ${courseTitle}`,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          checkoutResolvedRef.current = true;
          setMessage("Confirming payment with server...");

          const verifyResponse = await fetch("/api/payments/course/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });

          const verifyBody = await verifyResponse.json().catch(() => null);
          const redirectTarget =
            verifyBody?.redirectTo ||
            `/student/payments/pending?order_id=${encodeURIComponent(response.razorpay_order_id)}&payment_id=${encodeURIComponent(
              response.razorpay_payment_id
            )}&reason=verify_uncertain`;

          if (!verifyResponse.ok && verifyBody?.state === "failed") {
            setState("error");
            setMessage(verifyBody?.error ?? "Payment verification failed.");
            router.replace(redirectTarget);
            return;
          }

          router.replace(redirectTarget);
        },
        modal: {
          ondismiss: () => {
            if (checkoutResolvedRef.current) return;
            setState("idle");
            setMessage("Checkout closed before confirmation. We will keep checking payment status.");
            router.replace(`${pendingUrl}&reason=checkout_closed`);
          },
        },
      });

      (razorpay as unknown as { on: (event: string, callback: () => void) => void }).on("payment.failed", () => {
        checkoutResolvedRef.current = true;
        router.replace(`/student/payments/failed?order_id=${encodeURIComponent(order.id)}&reason=payment_failed`);
      });

      razorpay.open();
    } catch {
      setState("error");
      setMessage("Unable to process payment right now. Please try again.");
    }
  }

  async function toggleSaved() {
    setSavedBusy(true);
    setMessage("");

    const response = await fetch("/api/student/saved-courses", {
      method: isSaved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });

    const body = await response.json().catch(() => null);
    setSavedBusy(false);

    if (!response.ok) {
      setState("error");
      setMessage(body?.error ?? "Unable to update saved courses right now.");
      return;
    }

    setIsSaved((prev) => !prev);
    setState("idle");
    setMessage(isSaved ? "Removed from saved courses." : "Course saved for later.");
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <p className="text-sm text-slate-600">Course fee</p>
      <p className="text-2xl font-semibold">₹{feeAmount}</p>
      <div className="mt-3">
        <label className="text-xs text-slate-600">Coupon code (optional)</label>
        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
          placeholder="Enter coupon code"
          autoComplete="off"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={enrollNow}
        disabled={state === "loading" || purchaseDisabled}
        className="mt-3 w-full rounded bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {state === "loading" ? "Processing..." : hasActiveEnrollment ? "Already Enrolled" : "Pay & Enroll"}
      </button>

      <div className="mt-3">
        <button
          type="button"
          onClick={toggleSaved}
          disabled={savedBusy}
          className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
        >
          {savedBusy ? "Updating..." : isSaved ? "Unsave" : "Save for Later"}
        </button>
      </div>

      {message ? <p className={`mt-2 text-xs ${state === "error" ? "text-rose-700" : "text-slate-600"}`}>{message}</p> : null}
      {hasActiveEnrollment && !message ? <p className="mt-2 text-xs text-amber-700">{enrollmentActiveLabel} You are already enrolled. Please contact the institute for batch/session details.</p> : null}
      {!enrollmentOpen && !hasActiveEnrollment && !message ? <p className="mt-2 text-xs text-rose-700">{enrollmentBlockedMessage}</p> : null}
    </div>
  );
}
