"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";

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
}: {
  courseId: string;
  courseTitle: string;
  feeAmount: number;
  enrollmentOpen?: boolean;
  enrollmentBlockedMessage?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [cartBusy, setCartBusy] = useState(false);
  const [savedBusy, setSavedBusy] = useState(false);
  const [inCart, setInCart] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let ignore = false;

    async function loadState() {
      const [cartRes, savedRes] = await Promise.all([
        fetch("/api/student/cart", { method: "GET" }),
        fetch("/api/student/saved-courses", { method: "GET" }),
      ]);

      if (!ignore && cartRes.ok) {
        const body = await cartRes.json().catch(() => null);
        setInCart(Boolean(body?.items?.some((item: { course_id: string }) => item.course_id === courseId)));
      }

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
    if (!enrollmentOpen) {
      setState("error");
      setMessage(enrollmentBlockedMessage);
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
        setInCart(false);
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
      const orderRecordId = String(createOrderBody.orderRecordId ?? "");

      const razorpay = new window.Razorpay({
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "Vidya Infinity",
        description: `Enrollment: ${courseTitle}`,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          console.info("[course/frontend] razorpay handler called", {
            courseId,
            orderRecordId,
            razorpayOrderId: response.razorpay_order_id,
          });
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

          if (!verifyResponse.ok && verifyBody?.state !== "pending") {
            setState("error");
            setMessage(verifyBody?.error ?? "Payment verification failed.");
            if (verifyBody?.redirectUrl) {
              router.push(verifyBody.redirectUrl);
            }
            return;
          }

          if (verifyBody?.state === "success") {
            setState("success");
            setMessage("Payment verified and enrollment confirmed. Redirecting to confirmation...");
            router.push(verifyBody?.redirectUrl ?? `/student/payments/success?order_id=${encodeURIComponent(orderRecordId)}`);
          } else {
            setState("loading");
            setMessage("Payment submitted. Confirming transaction...");
            router.push(
              verifyBody?.redirectUrl ??
                `/student/payments/pending?order_id=${encodeURIComponent(orderRecordId)}&razorpay_order_id=${encodeURIComponent(
                  response.razorpay_order_id
                )}`
            );
          }

          await fetch("/api/student/cart", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseId }),
          }).catch(() => null);

          setInCart(false);
        },
        modal: {
          ondismiss: () => {
            console.info("[course/frontend] razorpay modal dismissed", { courseId, orderRecordId, razorpayOrderId: order.id });
            router.push(
              `/student/payments/pending?order_id=${encodeURIComponent(orderRecordId)}&razorpay_order_id=${encodeURIComponent(order.id)}`
            );
          },
        },
      });

      (razorpay as { on?: (event: string, callback: (payload: unknown) => void) => void }).on?.("payment.failed", () => {
        router.push(
          `/student/payments/failed?order_id=${encodeURIComponent(orderRecordId)}&razorpay_order_id=${encodeURIComponent(order.id)}`
        );
      });

      razorpay.open();
    } catch {
      setState("error");
      setMessage("Unable to process payment right now. Please try again.");
    }
  }

  async function toggleCart() {
    if (!enrollmentOpen) {
      setState("error");
      setMessage(enrollmentBlockedMessage);
      return;
    }

    setCartBusy(true);
    setMessage("");

    const response = await fetch("/api/student/cart", {
      method: inCart ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });

    const body = await response.json().catch(() => null);
    setCartBusy(false);

    if (!response.ok) {
      setState("error");
      setMessage(body?.error ?? "Unable to update cart right now.");
      return;
    }

    setInCart((prev) => !prev);
    setState("idle");
    setMessage(inCart ? "Removed from cart." : "Added to cart. Continue in checkout.");
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
        disabled={state === "loading" || !enrollmentOpen}
        className="mt-3 w-full rounded bg-brand-600 px-3 py-2 text-sm text-white disabled:opacity-60"
      >
        {state === "loading" ? "Processing..." : "Pay & Enroll"}
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={toggleCart}
          disabled={cartBusy || !enrollmentOpen}
          className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
        >
          {cartBusy ? "Updating..." : inCart ? "Remove from Cart" : "Add to Cart"}
        </button>
        <button
          type="button"
          onClick={toggleSaved}
          disabled={savedBusy}
          className="rounded border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
        >
          {savedBusy ? "Updating..." : isSaved ? "Unsave" : "Save for Later"}
        </button>
      </div>

      <div className="mt-3 flex gap-2 text-xs">
        <Link href="/student/cart" className="text-brand-700 underline underline-offset-2">Go to checkout cart</Link>
        <span className="text-slate-400">·</span>
        <Link href="/student/saved-courses" className="text-brand-700 underline underline-offset-2">Saved courses</Link>
      </div>

      {message ? <p className={`mt-2 text-xs ${state === "error" ? "text-rose-700" : "text-slate-600"}`}>{message}</p> : null}
      {!enrollmentOpen && !message ? <p className="mt-2 text-xs text-rose-700">{enrollmentBlockedMessage}</p> : null}
    </div>
  );
}
