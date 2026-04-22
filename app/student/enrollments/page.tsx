import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

const ENROLLMENT_STATUSES_VISIBLE = ["enrolled", "pending", "active", "suspended", "completed"] as const;
const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "captured", "success", "confirmed"]);

type EnrollmentRow = {
  id: string;
  course_id: string;
  enrollment_status: string | null;
  enrolled_at: string | null;
  access_start_at: string | null;
  access_end_at: string | null;
  created_at: string | null;
  course: { title: string | null; institute_id: string | null } | { title: string | null; institute_id: string | null }[] | null;
  institute: { name: string | null; phone: string | null; user_id: string | null } | { name: string | null; phone: string | null; user_id: string | null }[] | null;
  order: { payment_status: string | null; paid_at: string | null } | { payment_status: string | null; paid_at: string | null }[] | null;
};

type CourseOrderRow = {
  id: string;
  course_id: string | null;
  payment_status: string | null;
  paid_at: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function toTitleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function StudentEnrollmentsPage() {
  const { user } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();

  const [enrollmentsResult, ordersResult] = await Promise.all([
    supabase
      .from("course_enrollments")
      .select(
        "id,course_id,enrollment_status,enrolled_at,access_start_at,access_end_at,created_at,course:courses(title,institute_id),institute:institutes(name,phone,user_id),order:course_orders(payment_status,paid_at)"
      )
      .eq("student_id", user.id)
      .in("enrollment_status", [...ENROLLMENT_STATUSES_VISIBLE])
      .order("created_at", { ascending: false }),
    supabase
      .from("course_orders")
      .select("id,course_id,payment_status,paid_at,created_at")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (enrollmentsResult.error) {
    console.error("[student/enrollments] enrollment fetch failed", {
      user_id: user.id,
      error: enrollmentsResult.error.message,
    });
  }

  if (ordersResult.error) {
    console.error("[student/enrollments] orders fetch failed", {
      user_id: user.id,
      error: ordersResult.error.message,
    });
  }

  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const courseOrders = (ordersResult.data ?? []) as CourseOrderRow[];

  const courseIds = Array.from(
    new Set([
      ...enrollments.map((row) => row.course_id).filter((value): value is string => Boolean(value)),
      ...courseOrders.map((row) => row.course_id).filter((value): value is string => Boolean(value)),
    ])
  );

  const { data: courseRows } =
    courseIds.length > 0
      ? await supabase.from("courses").select("id,title,institute_id").in("id", courseIds)
      : { data: [] as { id: string; title: string | null; institute_id: string | null }[] };

  const courseById = new Map((courseRows ?? []).map((item) => [item.id, item]));

  const instituteIds = Array.from(
    new Set(
      (courseRows ?? [])
        .map((item) => item.institute_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const { data: institutes } =
    instituteIds.length > 0
      ? await supabase.from("institutes").select("id,name,phone,user_id").in("id", instituteIds)
      : { data: [] as { id: string; name: string | null; phone: string | null; user_id: string | null }[] };

  const instituteById = new Map((institutes ?? []).map((item) => [item.id, item]));
  const instituteUserIds = Array.from(new Set((institutes ?? []).map((item) => item.user_id).filter((value): value is string => Boolean(value))));

  const profileMap = new Map<string, { email: string | null }>();

  const { data: profiles } =
    instituteUserIds.length > 0 ? await supabase.from("profiles").select("id,email").in("id", instituteUserIds) : { data: [] as { id: string; email: string | null }[] };
  for (const profile of profiles ?? []) {
    profileMap.set(profile.id, { email: profile.email ?? null });
  }

  const paidOrderByCourseId = new Map<string, CourseOrderRow>();
  for (const order of courseOrders) {
    if (!order.course_id || paidOrderByCourseId.has(order.course_id)) continue;
    const normalized = String(order.payment_status ?? "").trim().toLowerCase();
    if (SUCCESS_PAYMENT_STATUSES.has(normalized) || order.paid_at) {
      paidOrderByCourseId.set(order.course_id, order);
    }
  }

  const fallbackEnrollmentCards = courseOrders
    .filter((order) => {
      if (!order.course_id) return false;
      if (enrollments.some((enrollment) => enrollment.course_id === order.course_id)) return false;
      const normalized = String(order.payment_status ?? "").trim().toLowerCase();
      return SUCCESS_PAYMENT_STATUSES.has(normalized) || Boolean(order.paid_at);
    })
    .map((order) => ({
      id: `order-${order.id}`,
      course_id: order.course_id as string,
      enrollment_status: "enrolled",
      enrolled_at: order.paid_at ?? order.created_at,
      access_start_at: order.paid_at ?? order.created_at,
      access_end_at: null,
      created_at: order.created_at,
      course: courseById.get(order.course_id as string) ?? null,
      institute: instituteById.get(courseById.get(order.course_id as string)?.institute_id ?? "") ?? null,
      order: { payment_status: order.payment_status, paid_at: order.paid_at },
    }));

  const mergedEnrollments = [...enrollments, ...fallbackEnrollmentCards];

  const nowMs = Date.now();
  const activeEnrollmentCount = mergedEnrollments.filter((enrollment) => {
    if (!enrollment.access_end_at) return true;
    const accessEndAtMs = new Date(enrollment.access_end_at).getTime();
    return Number.isFinite(accessEndAtMs) && accessEndAtMs > nowMs;
  }).length;

  console.info("[student/enrollments] enrollments_page_loaded", {
    event: "enrollments_page_loaded",
    user_id: user.id,
    total_enrollments: mergedEnrollments.length,
    active_enrollments: activeEnrollmentCount,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Enrollments</h1>
          <p className="mt-1 text-sm text-slate-600">View your active and past course enrollments with post-purchase institute details.</p>
        </div>
        <Link href="/courses" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">Browse Courses</Link>
      </div>

      <div className="mt-6 space-y-2">
        {mergedEnrollments.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">No enrollments yet. Purchase a course to see enrollments here.</div>
        ) : null}

        {mergedEnrollments.map((enrollment) => {
          const course = one(enrollment.course) ?? courseById.get(enrollment.course_id) ?? null;
          const institute = one(enrollment.institute) ?? instituteById.get(course?.institute_id ?? "") ?? null;
          const order = one(enrollment.order);
          const fallbackPaidOrder = paidOrderByCourseId.get(enrollment.course_id);
          const normalizedPaymentStatus = String(order?.payment_status ?? fallbackPaidOrder?.payment_status ?? "").trim().toLowerCase();
          const isPaid = SUCCESS_PAYMENT_STATUSES.has(normalizedPaymentStatus) || Boolean(order?.paid_at ?? fallbackPaidOrder?.paid_at);
          const instituteEmail = institute?.user_id ? profileMap.get(institute.user_id)?.email : null;
          const hasActiveAccess = !enrollment.access_end_at || new Date(enrollment.access_end_at).getTime() > nowMs;

          return (
            <div key={enrollment.id} className="rounded-xl border bg-white p-4 text-sm">
              <p className="font-medium text-slate-900">{course?.title ?? `Course ${enrollment.course_id}`}</p>
              <p className="mt-1 text-slate-700">Status: {toTitleCase(enrollment.enrollment_status ?? "unknown")}</p>
              <p className="mt-1 text-slate-700">Access: {hasActiveAccess ? "Active" : "Expired"}</p>
              <p className="mt-1 text-slate-700">Payment: {toTitleCase(order?.payment_status ?? fallbackPaidOrder?.payment_status ?? "unknown")}</p>
              <p className="mt-1 text-slate-700">Enrolled at: {formatDate(enrollment.enrolled_at ?? enrollment.created_at)}</p>
              {enrollment.access_start_at ? <p className="mt-1 text-slate-700">Access starts: {formatDate(enrollment.access_start_at)}</p> : null}
              {enrollment.access_end_at ? <p className="mt-1 text-slate-700">Access ends: {formatDate(enrollment.access_end_at)}</p> : null}

              {isPaid ? (
                <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                  <p className="font-medium">Institute details</p>
                  <p>Name: {institute?.name ?? "-"}</p>
                  <p>Email: {instituteEmail ?? "-"}</p>
                  <p>Phone: {institute?.phone ?? "-"}</p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">Complete payment to confirm enrollment for this course.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
