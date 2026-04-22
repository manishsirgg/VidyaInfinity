import Link from "next/link";

import { CoursePurchaseCard } from "@/components/courses/course-purchase-card";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

const ENROLLMENT_STATUSES_ACTIVE = ["enrolled", "pending", "active", "suspended", "completed"] as const;

export default async function StudentCartPage() {
  const { user } = await requireUser("student", { requireApproved: false });
  const supabase = await createClient();

  const { data: cartItems } = await supabase
    .from("student_cart_items")
    .select("id,created_at,course:courses!inner(id,title,summary,fees,status,is_active)")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  const cartCourseIds = Array.from(
    new Set(
      (cartItems ?? [])
        .map((item) => {
          const course = Array.isArray(item.course) ? item.course[0] : item.course;
          return course?.id ?? null;
        })
        .filter((value): value is string => Boolean(value))
    )
  );

  const activeEnrollmentMap = new Map<string, { access_end_at: string | null }>();
  if (cartCourseIds.length > 0) {
    const { data: enrollments } = await supabase
      .from("course_enrollments")
      .select("course_id,access_end_at")
      .eq("student_id", user.id)
      .in("course_id", cartCourseIds)
      .in("enrollment_status", [...ENROLLMENT_STATUSES_ACTIVE])
      .order("created_at", { ascending: false });

    for (const row of enrollments ?? []) {
      if (!row.course_id || activeEnrollmentMap.has(row.course_id)) continue;
      const isActive = !row.access_end_at || new Date(row.access_end_at).getTime() > Date.now();
      if (isActive) {
        activeEnrollmentMap.set(row.course_id, { access_end_at: row.access_end_at ?? null });
        console.info("[student/cart] course_purchase_disabled_existing_active_enrollment", {
          event: "course_purchase_disabled_existing_active_enrollment",
          student_id: user.id,
          course_id: row.course_id,
          access_end_at: row.access_end_at ?? null,
        });
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Checkout Cart</h1>
          <p className="mt-1 text-sm text-slate-600">Complete Razorpay payment course-by-course to confirm each enrollment.</p>
        </div>
        <Link href="/courses" className="rounded bg-brand-600 px-3 py-2 text-sm text-white">
          Browse Courses
        </Link>
      </div>

      <div className="mt-6 space-y-4">
        {(cartItems ?? []).length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Your checkout cart is empty.</div>
        ) : null}

        {(cartItems ?? []).map((item) => {
          const course = Array.isArray(item.course) ? item.course[0] : item.course;
          const existingActiveEnrollment = course?.id ? activeEnrollmentMap.get(course.id) : null;
          return (
            <div key={item.id} className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-[1.8fr_1fr]">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{course?.title ?? "Course"}</h2>
                <p className="mt-1 text-sm text-slate-700">{course?.summary ?? "No summary available."}</p>
                <p className="mt-2 text-sm text-slate-600">Fee: ₹{Number(course?.fees ?? 0)}</p>
              </div>
              <CoursePurchaseCard
                courseId={course?.id ?? ""}
                courseTitle={course?.title ?? "Course"}
                feeAmount={Number(course?.fees ?? 0)}
                hasActiveEnrollment={Boolean(existingActiveEnrollment)}
                activeEnrollmentEndsAt={existingActiveEnrollment?.access_end_at ?? null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
