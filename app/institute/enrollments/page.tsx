import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

function toTitleCase(value: string | null) {
  const raw = value ?? "unknown";
  return raw
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function Page() {
  const { user } = await requireUser("institute", { requireApproved: false });
  const supabase = await createClient();
  const { data: institute } = await supabase.from("institutes").select("id").eq("user_id", user.id).maybeSingle();

  const { data: enrollments } = institute
    ? await supabase
        .from("course_enrollments")
        .select(
          "id,student_id,course_id,enrollment_status,created_at,course:courses(title),order:course_orders(payment_status,gross_amount,paid_at),student:profiles(full_name,email,phone)"
        )
        .eq("institute_id", institute.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Institute Enrollments</h1>
      <p className="mt-2 text-sm text-slate-600">Paid enrollments include full student details for onboarding follow-up.</p>
      <div className="mt-4 space-y-2">
        {(enrollments ?? []).map((enrollment) => {
          const course = one(enrollment.course);
          const order = one(enrollment.order);
          const student = one(enrollment.student);

          return (
            <div key={enrollment.id} className="rounded border bg-white p-3 text-sm">
              <p className="font-medium">{course?.title ?? enrollment.course_id}</p>
              <p className="text-slate-700">Enrollment: {toTitleCase(enrollment.enrollment_status)}</p>
              <p className="text-slate-700">Payment: {toTitleCase(order?.payment_status ?? null)}</p>
              {order?.payment_status === "paid" ? (
                <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                  <p>Student: {student?.full_name ?? "-"}</p>
                  <p>Email: {student?.email ?? "-"}</p>
                  <p>Phone: {student?.phone ?? "-"}</p>
                  <p>Amount: ₹{order?.gross_amount ?? 0}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Student contact is shared only for paid enrollments.</p>
              )}
            </div>
          );
        })}
        {(enrollments ?? []).length === 0 ? <div className="rounded border bg-white p-3 text-sm text-slate-600">No enrollments yet.</div> : null}
      </div>
    </div>
  );
}
