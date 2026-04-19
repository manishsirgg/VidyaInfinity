import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

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

  const { data: enrollments } = await supabase
    .from("course_enrollments")
    .select(
      "id,course_id,enrollment_status,enrolled_at,access_start_at,access_end_at,created_at,course:courses(title,institute_id),institute:institutes(name,phone,user_id),order:course_orders(payment_status,paid_at)"
    )
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  const instituteUserIds = Array.from(
    new Set(
      (enrollments ?? [])
        .map((item) => one(item.institute)?.user_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const profileMap = new Map<string, { email: string | null }>();

  if (instituteUserIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id,email").in("id", instituteUserIds);
    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, { email: profile.email ?? null });
    }
  }

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
        {(enrollments ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">No enrollments yet. Purchase a course to see enrollments here.</div>
        ) : null}

        {(enrollments ?? []).map((enrollment) => {
          const course = one(enrollment.course);
          const institute = one(enrollment.institute);
          const order = one(enrollment.order);
          const isPaid = order?.payment_status === "paid";
          const instituteEmail = institute?.user_id ? profileMap.get(institute.user_id)?.email : null;

          return (
            <div key={enrollment.id} className="rounded-xl border bg-white p-4 text-sm">
              <p className="font-medium text-slate-900">{course?.title ?? `Course ${enrollment.course_id}`}</p>
              <p className="mt-1 text-slate-700">Status: {toTitleCase(enrollment.enrollment_status ?? "unknown")}</p>
              <p className="mt-1 text-slate-700">Payment: {toTitleCase(order?.payment_status ?? "unknown")}</p>
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
