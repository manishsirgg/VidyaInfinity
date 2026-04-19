import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
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

  const enrollmentResult = institute
    ? await dataClient
        .from("course_enrollments")
        .select("id,course_id,student_id,course_order_id,enrollment_status,created_at")
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] as EnrollmentRow[], error: null };

  const enrollments = (enrollmentResult.data ?? []) as EnrollmentRow[];

  const courseIds = [...new Set(enrollments.map((item) => item.course_id).filter(Boolean))];
  const userIds = [...new Set(enrollments.map((item) => item.student_id).filter(Boolean))];
  const orderIds = [...new Set(enrollments.map((item) => item.course_order_id).filter((value): value is string => Boolean(value)))];

  const [courseResult, studentResult, orderResult] = await Promise.all([
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
  const ordersById = new Map((orderResult.data ?? []).map((order) => [order.id, order]));

  const paidCount = enrollments.filter((item) => {
    const order = item.course_order_id ? ordersById.get(item.course_order_id) : null;
    return order?.payment_status === "paid";
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
          <p className="mt-1 text-2xl font-semibold">{enrollments.length}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Paid enrollments</p>
          <p className="mt-1 text-2xl font-semibold">{paidCount}</p>
        </div>
        <div className="rounded border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending/other</p>
          <p className="mt-1 text-2xl font-semibold">{Math.max(enrollments.length - paidCount, 0)}</p>
        </div>
      </div>

      {instituteError ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load institute record: {instituteError.message}</p> : null}
      {enrollmentResult.error ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Could not load enrollments: {enrollmentResult.error.message}</p> : null}
      {courseResult.error ? <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Some course titles could not be loaded: {courseResult.error.message}</p> : null}
      {studentResult.error ? <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Some student records could not be loaded: {studentResult.error.message}</p> : null}
      {orderResult.error ? <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Some payment records could not be loaded: {orderResult.error.message}</p> : null}

      <div className="mt-4 space-y-2">
        {enrollments.map((enrollment) => {
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

              {order?.payment_status === "paid" ? (
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

        {institute && enrollments.length === 0 && !enrollmentResult.error ? (
          <div className="rounded border bg-white p-3 text-sm text-slate-600">No enrollments yet.</div>
        ) : null}
      </div>
    </div>
  );
}
