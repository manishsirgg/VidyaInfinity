import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getCouponErrorMessage, normalizeCouponCode, validateCouponForScope } from "@/lib/coupons";
import { calculateCommission, sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { REFUND_ORDER_TYPE_TO_CANONICAL_KIND } from "@/lib/payments/order-kinds";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid } from "@/lib/payments/reconcile";
import { isInstituteEligibleForEnrollment } from "@/lib/institutes/enrollment-eligibility";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CourseRow = {
  id: string;
  title: string | null;
  institute_id: string;
  fees: number | null;
  batch_size: number | null;
  status: string | null;
  is_active: boolean | null;
  is_deleted: boolean | null;
  duration_value: number | null;
  duration_unit: string | null;
  end_date: string | null;
};

type StudentProfileRow = {
  id: string;
  role: string | null;
};

type InstituteRow = {
  id: string;
  status: string | null;
  verified: boolean | null;
  rejection_reason: string | null;
  is_deleted: boolean | null;
};

const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "captured", "success", "confirmed"]);
const ENROLLMENT_TERMINAL_STATUSES = new Set(["cancelled", "canceled", "expired", "dropped", "revoked", "refunded", "failed"]);

function extractUnknownErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;

  if (typeof error === "string" && error.trim()) return error;

  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;

    const nestedError = errorRecord.error;
    if (nestedError && typeof nestedError === "object") {
      const nestedRecord = nestedError as Record<string, unknown>;
      const nestedDescription = nestedRecord.description;
      if (typeof nestedDescription === "string" && nestedDescription.trim()) {
        return nestedDescription;
      }

      const nestedMessage = nestedRecord.message;
      if (typeof nestedMessage === "string" && nestedMessage.trim()) {
        return nestedMessage;
      }
    }

    const description = errorRecord.description;
    if (typeof description === "string" && description.trim()) return description;

    const message = errorRecord.message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return "Unable to create course order.";
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isEnrollmentBlocking(status: string | null | undefined) {
  const normalized = normalizeStatus(status);
  if (!normalized) return true;
  return !ENROLLMENT_TERMINAL_STATUSES.has(normalized);
}

function resolveAccessEndAt(startAtIso: string | null, durationValue: number | null, durationUnit: string | null) {
  if (!startAtIso || !durationValue || durationValue <= 0) return null;
  const startAt = new Date(startAtIso);
  if (Number.isNaN(startAt.getTime())) return null;

  const normalizedUnit = String(durationUnit ?? "").trim().toLowerCase();
  const resolved = new Date(startAt);
  if (["day", "days"].includes(normalizedUnit)) resolved.setUTCDate(resolved.getUTCDate() + durationValue);
  else if (["week", "weeks"].includes(normalizedUnit)) resolved.setUTCDate(resolved.getUTCDate() + durationValue * 7);
  else if (["month", "months"].includes(normalizedUnit)) resolved.setUTCMonth(resolved.getUTCMonth() + durationValue);
  else if (["year", "years"].includes(normalizedUnit)) resolved.setUTCFullYear(resolved.getUTCFullYear() + durationValue);
  else return null;

  return resolved.toISOString();
}


export async function POST(request: Request) {
  const schemaErrorResponse = await getPaymentSchemaErrorResponse(["common", "course"]);
  if (schemaErrorResponse) return schemaErrorResponse;

  try {
    const auth = await requireApiUser("student", { requireApproved: false });
    if ("error" in auth) return auth.error;

    const { courseId, couponCode } = (await request.json()) as { courseId?: string; couponCode?: string | null };
    if (!courseId) {
      return NextResponse.json({ error: "courseId is required" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

    const { data: studentProfile, error: studentProfileError } = await admin.data
      .from("profiles")
      .select("id,role")
      .eq("id", auth.user.id)
      .maybeSingle<StudentProfileRow>();

    if (studentProfileError) {
      console.error("[course/create-order] student profile lookup failed", {
        userId: auth.user.id,
        error: studentProfileError.message,
      });
      return NextResponse.json({ error: "Unable to validate student profile." }, { status: 500 });
    }

    if (!studentProfile) {
      console.warn("[course/create-order] student profile missing", { userId: auth.user.id });
      return NextResponse.json({ error: "Student profile missing. Please complete your account setup." }, { status: 400 });
    }

    if (studentProfile.id !== auth.user.id) {
      console.error("[course/create-order] student profile lookup mismatch", {
        userId: auth.user.id,
        profileId: studentProfile.id,
      });
      return NextResponse.json({ error: "Profile lookup mismatch. Please sign in again and retry." }, { status: 400 });
    }

    if (normalizeStatus(studentProfile.role) !== "student") {
      console.warn("[course/create-order] non-student profile attempted course purchase", {
        userId: auth.user.id,
        profileRole: studentProfile.role,
      });
      return NextResponse.json({ error: "Only student accounts can purchase courses." }, { status: 403 });
    }

    const studentId = studentProfile.id;

    const { data: course, error: courseError } = await admin.data
      .from("courses")
      .select("id,title,institute_id,fees,batch_size,status,is_active,is_deleted,duration_value,duration_unit,end_date")
      .eq("id", courseId)
      .maybeSingle<CourseRow>();

    if (courseError) {
      console.error("[course/create-order] course lookup failed", {
        courseId,
        studentId,
        error: courseError.message,
      });
      return NextResponse.json({ error: "Unable to validate course eligibility right now." }, { status: 500 });
    }

    if (!course) {
      console.warn("[course/create-order] course not found", { courseId, studentId });
      return NextResponse.json({ error: "This course is not available for enrollment." }, { status: 404 });
    }
    if (course.is_deleted) {
      console.warn("[course/create-order] course deleted", { courseId: course.id, studentId });
      return NextResponse.json({ error: "This course has been deleted and cannot be enrolled." }, { status: 400 });
    }
    if (course.is_active === false) {
      console.warn("[course/create-order] course inactive", { courseId: course.id, studentId });
      return NextResponse.json({ error: "This course is inactive and not open for enrollment." }, { status: 400 });
    }

    const courseStatus = normalizeStatus(course.status);
    const effectiveCourseStatus = courseStatus;
    if (["pending", "rejected", "draft", "archived", "inactive", "cancelled"].includes(effectiveCourseStatus)) {
      console.warn("[course/create-order] course not approved", {
        courseId: course.id,
        studentId,
        status: course.status,
      });
      return NextResponse.json({ error: "This course is not approved for enrollment yet." }, { status: 400 });
    }
    if (effectiveCourseStatus && !["approved", "active", "live", "published", "listed"].includes(effectiveCourseStatus)) {
      console.warn("[course/create-order] course status unsupported for purchase", {
        courseId: course.id,
        studentId,
        status: course.status,
      });
      return NextResponse.json({ error: "This course is not approved for enrollment yet." }, { status: 400 });
    }

    const ensuredCourse: CourseRow = course;

    const { data: institute } = await admin.data
      .from("institutes")
      .select("id,status,verified,rejection_reason,is_deleted")
      .eq("id", ensuredCourse.institute_id)
      .maybeSingle<InstituteRow>();

    if (!institute) {
      console.warn("[course/create-order] institute missing for course", {
        courseId: ensuredCourse.id,
        instituteId: ensuredCourse.institute_id,
        studentId,
      });
      return NextResponse.json({ error: "This institute is not currently accepting enrollments." }, { status: 400 });
    }
    if (!isInstituteEligibleForEnrollment(institute)) {
      console.warn("[course/create-order] institute invalid for enrollment", {
        courseId: ensuredCourse.id,
        instituteId: institute.id,
        studentId,
        status: institute.status,
        verified: institute.verified,
        rejectionReason: institute.rejection_reason,
        isDeleted: institute.is_deleted,
      });
      return NextResponse.json({ error: "Institute invalid: enrollment is currently unavailable for this course." }, { status: 400 });
    }
    const ensuredInstitute: InstituteRow = institute;

    if (ensuredInstitute.id !== ensuredCourse.institute_id) {
      return NextResponse.json({ error: "Course and institute relationship is invalid." }, { status: 400 });
    }


    const { data: courseEnrollmentRows, error: courseEnrollmentRowsError } = await admin.data
      .from("course_enrollments")
      .select("id,enrollment_status")
      .eq("course_id", ensuredCourse.id);

    if (courseEnrollmentRowsError) {
      console.error("[course/create-order] enrollment seat count failed", {
        courseId: ensuredCourse.id,
        studentId,
        error: courseEnrollmentRowsError.message,
      });
      return NextResponse.json({ error: "Unable to validate seat availability right now." }, { status: 500 });
    }
    const activeEnrollmentCount = (courseEnrollmentRows ?? []).filter((row) => isEnrollmentBlocking(row.enrollment_status)).length;

    const capacity = ensuredCourse.batch_size ?? null;
    if (capacity !== null && capacity >= 0 && (activeEnrollmentCount ?? 0) >= capacity) {
      console.warn("[course/create-order] course batch is full", {
        courseId: ensuredCourse.id,
        studentId,
        batchSize: capacity,
        filledSeats: activeEnrollmentCount ?? 0,
      });
      return NextResponse.json({ error: "This course batch is full and not accepting new enrollments." }, { status: 400 });
    }

    const { data: existingEnrollments, error: existingEnrollmentError } = await admin.data
      .from("course_enrollments")
      .select("id,access_end_at,enrollment_status,created_at")
      .eq("student_id", studentId)
      .eq("course_id", ensuredCourse.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (existingEnrollmentError) {
      console.error("[course/create-order] existing enrollment lookup failed", {
        courseId: ensuredCourse.id,
        studentId,
        error: existingEnrollmentError.message,
      });
      return NextResponse.json({ error: "Unable to validate enrollment status right now." }, { status: 500 });
    }

    const existingEnrollment =
      (existingEnrollments ?? []).find((row) => isEnrollmentBlocking(row.enrollment_status)) ?? null;
    const enrollmentAccessEndsAt = existingEnrollment?.access_end_at ?? null;
    const hasActiveEnrollment = Boolean(existingEnrollment && (!enrollmentAccessEndsAt || new Date(enrollmentAccessEndsAt).getTime() > Date.now()));

    if (hasActiveEnrollment && existingEnrollment) {
      console.warn("[course/create-order] already enrolled", {
        event: "course_purchase_disabled_existing_active_enrollment",
        courseId: ensuredCourse.id,
        studentId,
        enrollmentId: existingEnrollment.id,
        accessEndAt: existingEnrollment.access_end_at,
      });
      return NextResponse.json(
        { error: enrollmentAccessEndsAt ? `Enrollment active until ${enrollmentAccessEndsAt}.` : "You are already enrolled in this course." },
        { status: 409 }
      );
    }

    const { data: existingPaidOrder, error: existingPaidOrderError } = await admin.data
      .from("course_orders")
      .select("id,payment_status,paid_at,created_at")
      .eq("student_id", studentId)
      .eq("course_id", ensuredCourse.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; payment_status: string | null; paid_at: string | null; created_at: string | null }>();

    if (existingPaidOrderError) {
      console.error("[course/create-order] existing paid order lookup failed", {
        courseId: ensuredCourse.id,
        studentId,
        error: existingPaidOrderError.message,
      });
      return NextResponse.json({ error: "Unable to validate existing purchases right now." }, { status: 500 });
    }

    if (existingPaidOrder) {
      const normalizedPaymentStatus = normalizeStatus(existingPaidOrder.payment_status);
      const hasConfirmedPayment = SUCCESS_PAYMENT_STATUSES.has(normalizedPaymentStatus) || Boolean(existingPaidOrder.paid_at);
      if (hasConfirmedPayment) {
        const fallbackAccessEndAt = resolveAccessEndAt(
          existingPaidOrder.paid_at ?? existingPaidOrder.created_at ?? null,
          ensuredCourse.duration_value ?? null,
          ensuredCourse.duration_unit ?? null
        );
        const effectivePaidAccessEndAt = fallbackAccessEndAt;
        const hasActivePaidAccess = !effectivePaidAccessEndAt || new Date(effectivePaidAccessEndAt).getTime() > Date.now();
        if (hasActivePaidAccess) {
          return NextResponse.json(
            { error: effectivePaidAccessEndAt ? `Enrollment active until ${effectivePaidAccessEndAt}.` : "You are already enrolled in this course." },
            { status: 409 }
          );
        }
      }
    }

    const { data: commissionRow, error: commissionError } = await admin.data
      .from("platform_commission_settings")
      .select("commission_percent,commission_percentage")
      .eq("key", "default")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ commission_percent: number | null; commission_percentage: number | null }>();

    if (commissionError) {
      return NextResponse.json({ error: `Unable to read commission settings: ${commissionError.message}` }, { status: 500 });
    }

    const commissionPercentage = sanitizeCommissionPercentage(
      commissionRow?.commission_percent ?? commissionRow?.commission_percentage
    );
    if (commissionPercentage === null) {
      return NextResponse.json({ error: "Platform commission is not configured." }, { status: 500 });
    }

    const normalizedCouponCode = normalizeCouponCode(couponCode);
    const grossAmount = Number(Number(ensuredCourse.fees ?? 0).toFixed(2));
    let discountPercent = 0;
    let discountAmount = 0;
    let appliedCouponCode: string | null = null;

    if (normalizedCouponCode) {
      const { data: coupon, error: couponError } = await admin.data
        .from("coupons")
        .select("code,discount_percent,active,expiry_date,applies_to,is_deleted")
        .eq("code", normalizedCouponCode)
        .eq("applies_to", "course")
        .maybeSingle<{
          code: string;
          discount_percent: number;
          active: boolean | null;
          expiry_date: string | null;
          applies_to: string | null;
          is_deleted?: boolean | null;
        }>();

      if (couponError) return NextResponse.json({ error: couponError.message }, { status: 500 });
      if (coupon?.is_deleted) {
        console.warn("[course/create-order] invalid coupon (deleted)", {
          courseId: ensuredCourse.id,
          studentId,
          couponCode: normalizedCouponCode,
        });
        return NextResponse.json({ error: "This coupon is no longer available." }, { status: 400 });
      }

      const couponCheck = validateCouponForScope(coupon ?? null, "course");
      if (!couponCheck.ok || !coupon) {
        const reason = couponCheck.ok ? "Coupon not found" : couponCheck.reason;
        console.warn("[course/create-order] invalid coupon", {
          courseId: ensuredCourse.id,
          studentId,
          couponCode: normalizedCouponCode,
          reason,
        });
        return NextResponse.json({ error: getCouponErrorMessage(reason) }, { status: 400 });
      }

      discountPercent = Number(coupon.discount_percent ?? 0);
      discountAmount = Number(Math.max(0, (grossAmount * discountPercent) / 100).toFixed(2));
      appliedCouponCode = coupon.code;
    }

    const finalPayableAmount = Number(Math.max(0, grossAmount - discountAmount).toFixed(2));
    const commission = calculateCommission(finalPayableAmount, commissionPercentage);
    const now = new Date().toISOString();

    const createOrderPayload = {
      student_id: studentId,
      course_id: ensuredCourse.id,
      institute_id: ensuredCourse.institute_id,
      order_kind: REFUND_ORDER_TYPE_TO_CANONICAL_KIND.course,
      payment_status: "created",
      gross_amount: commission.grossAmount,
      commission_percent: commission.commissionPercentage,
      platform_fee_amount: commission.commissionAmount,
      institute_receivable_amount: commission.instituteReceivable,
      currency: "INR",
      razorpay_order_id: `pending_${ensuredCourse.id.slice(0, 8)}_${Date.now()}`,
      razorpay_receipt: null,
      metadata: {
        source: "course_create_order_api",
        coupon_code: appliedCouponCode,
        coupon_discount_percent: discountPercent,
        coupon_discount_amount: discountAmount,
        base_amount: grossAmount,
        final_payable_amount: finalPayableAmount,
      },
      created_at: now,
      updated_at: now,
    };

    const { data: insertedOrder, error: orderError } = await admin.data
      .from("course_orders")
      .insert(createOrderPayload)
      .select("id,student_id,course_id,institute_id,gross_amount,institute_receivable_amount,currency,payment_status")
      .single<{
        id: string;
        student_id: string;
        course_id: string;
        institute_id: string;
        gross_amount: number;
        institute_receivable_amount: number;
        currency: string;
        payment_status: string;
      }>();

    if (orderError) {
      console.error("[course/create-order] failed order insert", {
        courseId: ensuredCourse.id,
        studentId,
        error: orderError.message,
      });
      return NextResponse.json({ error: "Failed order insert. Please retry." }, { status: 500 });
    }


    console.info("[course/create-order] order draft inserted", {
      studentId,
      courseId: ensuredCourse.id,
      orderRecordId: insertedOrder.id,
      grossAmount: commission.grossAmount,
      finalPayableAmount,
      couponCode: appliedCouponCode,
    });

    if (finalPayableAmount <= 0) {
      const freeOrderId = `free_order_${insertedOrder.id}`;
      const freePaymentId = `free_payment_${insertedOrder.id}`;

      await admin.data
        .from("course_orders")
        .update({
          razorpay_order_id: freeOrderId,
          razorpay_receipt: `free_receipt_${insertedOrder.id}`,
          metadata: {
            ...createOrderPayload.metadata,
            free_checkout: true,
          },
        })
        .eq("id", insertedOrder.id);

      const reconciled = await reconcileCourseOrderPaid({
        supabase: admin.data,
        order: {
          ...insertedOrder,
          payment_status: "created",
        },
        razorpayOrderId: freeOrderId,
        razorpayPaymentId: freePaymentId,
        source: "verify_api",
      });

      if (reconciled.error) {
        return NextResponse.json({ error: reconciled.error }, { status: 500 });
      }


      console.info("[course/create-order] free course reconciled", { studentId, courseId: ensuredCourse.id, orderRecordId: insertedOrder.id });

      return NextResponse.json({
        orderRecordId: insertedOrder.id,
        freeCourse: true,
        enrolled: true,
        message: "Enrollment confirmed for this free course.",
      });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

    let order: { id: string; receipt?: string | null };

    try {
      order = await razorpay.data.orders.create({
        amount: Math.round(finalPayableAmount * 100),
        currency: "INR",
        receipt: `course_${ensuredCourse.id.slice(0, 8)}_${Date.now()}`,
        notes: {
          studentId,
          courseId: ensuredCourse.id,
          instituteId: ensuredCourse.institute_id,
        },
      });
    } catch (error) {
      const errorMessage = extractUnknownErrorMessage(error);
      console.error("[course/create-order] razorpay order creation failed", {
        studentId,
        courseId: ensuredCourse.id,
        error,
        errorMessage,
      });
      return NextResponse.json({ error: `Razorpay order creation failed: ${errorMessage}` }, { status: 502 });
    }

    const { error: updateOrderError } = await admin.data
      .from("course_orders")
      .update({
        razorpay_order_id: order.id,
        razorpay_receipt: order.receipt ?? null,
      })
      .eq("id", insertedOrder.id);

    if (updateOrderError) return NextResponse.json({ error: updateOrderError.message }, { status: 500 });

    console.info("[course/create-order] razorpay order created", {
      studentId,
      courseId: ensuredCourse.id,
      orderRecordId: insertedOrder.id,
      razorpayOrderId: order.id,
    });

    return NextResponse.json({
      order,
      orderRecordId: insertedOrder.id,
      pricing: {
        grossAmount,
        discountPercent,
        discountAmount,
        finalPayableAmount,
        commissionPercent: commission.commissionPercentage,
        platformFeeAmount: commission.commissionAmount,
        instituteReceivableAmount: commission.instituteReceivable,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: extractUnknownErrorMessage(error) },
      { status: 500 }
    );
  }
}
