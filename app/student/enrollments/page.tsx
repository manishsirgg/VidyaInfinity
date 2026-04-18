import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

function formatDate(value: string) {
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

export default async function StudentEnrollmentsPage() {
  const { user } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("course_enrollments")
    .select("id,course_id,enrollment_status,starts_at,ends_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Enrollments</h1>
          <p className="mt-1 text-sm text-slate-600">View your active and past course enrollments.</p>
        </div>
        <Link href="/courses" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">
          Browse Courses
        </Link>
      </div>

      <div className="mt-6 space-y-2">
        {(enrollments ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">No enrollments yet. Purchase a course to see enrollments here.</div>
        ) : null}

        {(enrollments ?? []).map((enrollment) => (
          <div key={enrollment.id} className="rounded-xl border bg-white p-4 text-sm">
            <p className="font-medium text-slate-900">Course ID: {enrollment.course_id}</p>
            <p className="mt-1 text-slate-700">Status: {toTitleCase(enrollment.enrollment_status ?? "unknown")}</p>
            {enrollment.starts_at ? <p className="mt-1 text-slate-700">Starts: {formatDate(enrollment.starts_at)}</p> : null}
            {enrollment.ends_at ? <p className="mt-1 text-slate-700">Ends: {formatDate(enrollment.ends_at)}</p> : null}
            <p className="mt-2 text-xs text-slate-500">Created: {formatDate(enrollment.created_at)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
