import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getCouponErrorMessage, normalizeCouponCode, validateCouponForScope } from "@/lib/coupons";
import { calculateCommission, sanitizeCommissionPercentage } from "@/lib/payments/commission";
import { getPaymentSchemaErrorResponse } from "@/lib/payments/ensure-payment-schema";
import { getRazorpayClient } from "@/lib/payments/razorpay";
import { reconcileCourseOrderPaid } from "@/lib/payments/reconcile";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CourseRow = {
  id: string;
  title: string | null;
  institute_id: string;
  fees: number | null;
  batch_size: number | null;
  status: string | null;
  admission_deadline: string | null;
  is_active: boolean | null;
  is_deleted: boolean | null;
};

type StudentProfileRow = {
  id: string;
  role: string | null;
};

type InstituteRow = {
  id: string;
  status: string | null;
  is_active: boolean | null;
  is_deleted: boolean | null;
};

const ENROLLMENT_STATUSES_BLOCKING_NEW_PURCHASE = ["pending", "active", "suspended", "completed"] as const;

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isInstituteUsable(institute: InstituteRow | null) {
  if (!institute || institute.is_deleted) return false;
  if (institute.is_active === false) return false;

  const instituteStatus = normalizeStatus(institute.status);
  const effectiveStatus = instituteStatus;

  if (["rejected", "suspended", "blocked", "inactive", "archived"].includes(effectiveStatus)) return false;
  if (effectiveStatus && !["approved", "active"].includes(effectiveStatus)) return false;

  return true;
}

function isAdmissionDeadlinePassed(admissionDeadline: string | null) {
  if (!admissionDeadline) return false;
  const normalized = admissionDeadline.trim();
  if (!normalized) return false;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const endOfDay = new Date(`${normalized}T23:59:59.999Z`);
    if (Number.isNaN(endOfDay.getTime())) return false;
    return endOfDay.getTime() < Date.now();
  }

  const deadlineAt = new Date(normalized);
  if (Number.isNaN(deadlineAt.getTime())) return false;
  return deadlineAt.getTime() < Date.now();
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
      .select("id,title,institute_id,fees,batch_size,status,admission_deadline,is_active,is_deleted")
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
      .select("id,status,is_active,is_deleted")
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
    if (!isInstituteUsable(institute)) {
      console.warn("[course/create-order] institute invalid for enrollment", {
        courseId: ensuredCourse.id,
        instituteId: institute.id,
        studentId,
        status: institute.status,
        isActive: institute.is_active,
        isDeleted: institute.is_deleted,
      });
      return NextResponse.json({ error: "Institute invalid: enrollment is currently unavailable for this course." }, { status: 400 });
    }
    const ensuredInstitute: InstituteRow = institute;

    if (ensuredInstitute.id !== ensuredCourse.institute_id) {
      return NextResponse.json({ error: "Course and institute relationship is invalid." }, { status: 400 });
    }

    if (isAdmissionDeadlinePassed(ensuredCourse.admission_deadline)) {
      console.warn("[course/create-order] admission deadline passed", {
        courseId: ensuredCourse.id,
        studentId,
        admissionDeadline: ensuredCourse.admission_deadline,
      });
      return NextResponse.json({ error: "Admission deadline has passed for this course." }, { status: 400 });
    }

    const { count: activeEnrollmentCount, error: activeEnrollmentCountError } = await admin.data
      .from("course_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", ensuredCourse.id)
      .in("enrollment_status", [...ENROLLMENT_STATUSES_BLOCKING_NEW_PURCHASE]);

    if (activeEnrollmentCountError) {
      console.error("[course/create-order] enrollment seat count failed", {
        courseId: ensuredCourse.id,
        studentId,
        error: activeEnrollmentCountError.message,
      });
      return NextResponse.json({ error: "Unable to validate seat availability right now." }, { status: 500 });
    }

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

    const { data: existingEnrollment, error: existingEnrollmentError } = await admin.data
      .from("course_enrollments")
      .select("id")
      .eq("student_id", studentId)
      .eq("course_id", ensuredCourse.id)
      .in("enrollment_status", [...ENROLLMENT_STATUSES_BLOCKING_NEW_PURCHASE])
      .maybeSingle();

    if (existingEnrollmentError) {
      console.error("[course/create-order] existing enrollment lookup failed", {
        courseId: ensuredCourse.id,
        studentId,
        error: existingEnrollmentError.message,
      });
      return NextResponse.json({ error: "Unable to validate enrollment status right now." }, { status: 500 });
    }

    if (existingEnrollment) {
      console.warn("[course/create-order] already enrolled", {
        courseId: ensuredCourse.id,
        studentId,
        enrollmentId: existingEnrollment.id,
      });
      return NextResponse.json({ error: "You are already enrolled in this course." }, { status: 409 });
    }

    const { data: commissionRow, error: commissionError } = await admin.data
      .from("platform_commission_settings")
      .select("commission_percentage")
      .eq("key", "default")
      .maybeSingle<{ commission_percentage: number }>();

    if (commissionError) {
      return NextResponse.json({ error: `Unable to read commission settings: ${commissionError.message}` }, { status: 500 });
    }

    const commissionPercentage = sanitizeCommissionPercentage(commissionRow?.commission_percentage);
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
      order_kind: "course_enrollment",
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

      await admin.data.from("student_cart_items").delete().eq("student_id", studentId).eq("course_id", ensuredCourse.id);

      return NextResponse.json({
        orderRecordId: insertedOrder.id,
        freeCourse: true,
        enrolled: true,
        message: "Enrollment confirmed for this free course.",
      });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay.ok) return NextResponse.json({ error: razorpay.error }, { status: 500 });

    const order = await razorpay.data.orders.create({
      amount: Math.round(finalPayableAmount * 100),
      currency: "INR",
      receipt: `course_${ensuredCourse.id.slice(0, 8)}_${Date.now()}`,
      notes: {
        studentId,
        courseId: ensuredCourse.id,
        instituteId: ensuredCourse.institute_id,
      },
    });

    const { error: updateOrderError } = await admin.data
      .from("course_orders")
      .update({
        razorpay_order_id: order.id,
        razorpay_receipt: order.receipt ?? null,
      })
      .eq("id", insertedOrder.id);

    if (updateOrderError) return NextResponse.json({ error: updateOrderError.message }, { status: 500 });

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
      { error: error instanceof Error ? error.message : "Unable to create course order." },
      { status: 500 }
    );
  }
}
