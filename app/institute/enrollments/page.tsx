import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { isSuccessfulPaymentStatus } from "@/lib/payments/payment-status";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function money(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function toTitleCase(value: string | null) {
  const raw = value ?? "unknown";
  return raw
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN");
}

type EnrollmentRow = {
  id: string;
  course_id: string;
  student_id: string;
  course_order_id: string | null;
  enrollment_status: string | null;
  created_at: string;
};

type CourseOrderRow = {
  id: string;
  course_id: string | null;
  student_id: string | null;
  payment_status: string | null;
  gross_amount: number | null;
  paid_at: string | null;
  created_at: string | null;
};

function isPaidOrder(order: { payment_status: string | null; paid_at?: string | null }) {
  const normalized = String(order.payment_status ?? "").trim().toLowerCase();
  if (["failed", "refunded", "cancelled", "canceled", "rejected"].includes(normalized)) return false;
  return isSuccessfulPaymentStatus(normalized) || Boolean(order.paid_at);
}

export default async function InstituteEnrollmentsPage() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: institute, error: instituteError } = await dataClient
    .from("institutes")
    .select("id,name")
    .eq("user_id", user.id)
    .maybeSingle();

  const [enrollmentResult, instituteOrderResult] = institute
    ? await Promise.all([
        dataClient
          .from("course_enrollments")
          .select("id,course_id,student_id,course_order_id,enrollment_status,created_at")
          .eq("institute_id", institute.id)
          .order("created_at", { ascending: false }),
        dataClient
          .from("course_orders")
          .select("id,course_id,student_id,payment_status,gross_amount,paid_at,created_at")
          .eq("institute_id", institute.id)
          .order("created_at", { ascending: false }),
      ])
    : [
        { data: [] as EnrollmentRow[], error: null },
        { data: [] as CourseOrderRow[], error: null },
      ];

  const enrollments = (enrollmentResult.data ?? []) as EnrollmentRow[];
  const instituteOrders = (instituteOrderResult.data ?? []) as CourseOrderRow[];
  const paidOrders = instituteOrders.filter((order) => isPaidOrder(order));

  const enrollmentOrderIds = new Set(enrollments.map((item) => item.course_order_id).filter((value): value is string => Boolean(value)));
  const enrollmentStudentCoursePairs = new Set(enrollments.map((item) => `${item.student_id}::${item.course_id}`));

  const fallbackEnrollmentRows: EnrollmentRow[] = paidOrders
    .filter((order) => {
      if (!order.id || !order.course_id || !order.student_id) return false;
      if (enrollmentOrderIds.has(order.id)) return false;
      return !enrollmentStudentCoursePairs.has(`${order.student_id}::${order.course_id}`);
    })
    .map((order) => ({
      id: `fallback-${order.id}`,
      course_id: order.course_id as string,
      student_id: order.student_id as string,
      course_order_id: order.id,
      enrollment_status: "enrolled",
      created_at: order.paid_at ?? order.created_at ?? new Date().toISOString(),
    }));

  const mergedEnrollments = [...enrollments, ...fallbackEnrollmentRows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const courseIds = [...new Set(mergedEnrollments.map((item) => item.course_id).filter(Boolean))];
  const userIds = [...new Set(mergedEnrollments.map((item) => item.student_id).filter(Boolean))];
  const orderIds = [...new Set(mergedEnrollments.map((item) => item.course_order_id).filter((value): value is string => Boolean(value)))];

  const [courseResult, studentResult, linkedOrderResult] = await Promise.all([
    courseIds.length
      ? dataClient.from("courses").select("id,title").in("id", courseIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? dataClient.from("profiles").select("id,full_name,email,phone").in("id", userIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? dataClient.from("course_orders").select("id,payment_status,gross_amount,paid_at,created_at").in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const coursesById = new Map((courseResult.data ?? []).map((course) => [course.id, course]));
  const studentsById = new Map((studentResult.data ?? []).map((student) => [student.id, student]));
  const ordersById = new Map([...(linkedOrderResult.data ?? []), ...instituteOrders].map((order) => [order.id, order]));

  const paidCount = mergedEnrollments.filter((item) => {
    const order = item.course_order_id ? ordersById.get(item.course_order_id) : null;
    return Boolean(order && isPaidOrder(order));
  }).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Institute Enrollments</h1>
          <p className="mt-2 text-sm text-slate-600">Paid enrollments include full student details for onboarding follow-up.</p>
        </div>
        <Link href="/institute/wallet" className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          View wallet & payouts
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total enrollments</p>
          <p className="mt-1 text-2xl font-semibold">{mergedEnrollments.length}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Paid enrollments</p>
          <p className="mt-1 text-2xl font-semibold">{paidCount}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending/other</p>
          <p className="mt-1 text-2xl font-semibold">{Math.max(mergedEnrollments.length - paidCount, 0)}</p>
        </div>
      </div>

      {instituteError ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load institute record: {instituteError.message}</p> : null}
      {enrollmentResult.error ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load enrollments: {enrollmentResult.error.message}</p> : null}
      {instituteOrderResult.error ? <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Some payment records could not be loaded: {instituteOrderResult.error.message}</p> : null}
      {courseResult.error ? <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Some course titles could not be loaded: {courseResult.error.message}</p> : null}
      {studentResult.error ? <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Some student records could not be loaded: {studentResult.error.message}</p> : null}
      {linkedOrderResult.error ? <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Some linked enrollment orders could not be loaded: {linkedOrderResult.error.message}</p> : null}

      <div className="mt-4 space-y-2">
        {mergedEnrollments.map((enrollment) => {
          const course = coursesById.get(enrollment.course_id);
          const student = studentsById.get(enrollment.student_id);
          const order = enrollment.course_order_id ? ordersById.get(enrollment.course_order_id) : null;

          return (
            <article key={enrollment.id} className="rounded border bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{course?.title ?? enrollment.course_id}</p>
                <p className="text-xs text-slate-500">Created: {formatDate(enrollment.created_at)}</p>
              </div>

              <div className="mt-1 text-slate-700">Enrollment: {toTitleCase(enrollment.enrollment_status)}</div>
              <div className="text-slate-700">Payment: {toTitleCase(order?.payment_status ?? null)}</div>

              {order && isPaidOrder(order) ? (
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                  <p>Student: {student?.full_name ?? "-"}</p>
                  <p>Email: {student?.email ?? "-"}</p>
                  <p>Phone: {student?.phone ?? "-"}</p>
                  <p>Amount: {money(Number(order.gross_amount ?? 0))}</p>
                  <p>Paid at: {formatDate(order.paid_at)}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Pending payment confirmation.</p>
              )}
            </article>
          );
        })}

        {institute && mergedEnrollments.length === 0 && !enrollmentResult.error ? (
          <div className="rounded border bg-white p-3 text-sm text-slate-600">No enrollments yet.</div>
        ) : null}
      </div>
    </div>
  );
}
