import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

type CompareCourse = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  fee_amount: number | null;
  duration_value: number | null;
  duration_unit: string | null;
  delivery_mode: string | null;
  category: string | null;
  subcategory: string | null;
  course_level: string | null;
  language: string | null;
  certificate_available: boolean | null;
};

function val(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

export default async function CourseComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const params = await searchParams;
  const ids = String(params.ids ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  const supabase = await createClient();
  const { data } = ids.length
    ? await supabase
        .from("courses")
        .select(
          "id,title,slug,summary,fee_amount,duration_value,duration_unit,delivery_mode,category,subcategory,course_level,language,certificate_available,approval_status"
        )
        .in("id", ids)
        .eq("approval_status", "approved")
    : { data: [] };

  const courses: CompareCourse[] = (data ?? []) as CompareCourse[];

  const rows: Array<[string, (course: CompareCourse) => string]> = [
    ["Course", (course) => course.title],
    ["Summary", (course) => val(course.summary)],
    ["Fees", (course) => `₹${val(course.fee_amount)}`],
    ["Duration", (course) => `${val(course.duration_value)} ${val(course.duration_unit)}`],
    ["Mode", (course) => val(course.delivery_mode)],
    ["Category", (course) => `${val(course.category)} / ${val(course.subcategory)}`],
    ["Level", (course) => val(course.course_level)],
    ["Language", (course) => val(course.language)],
    ["Certificate", (course) => (course.certificate_available ? "Yes" : "No")],
    ["Support", () => "Revealed after enrollment"],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compare Courses</h1>
        <Link href="/courses" className="text-sm text-brand-600">
          Back to courses
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-600">Only approved courses are compared. Institute identity stays hidden before purchase.</p>

      {courses.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full divide-y text-sm">
            <thead>
              <tr>
                <th className="bg-slate-50 px-3 py-2 text-left">Field</th>
                {courses.map((course) => (
                  <th key={course.id} className="bg-slate-50 px-3 py-2 text-left">
                    <Link href={`/courses/${course.slug}`} className="text-brand-600 underline">
                      {course.title}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(([label, getValue]) => (
                <tr key={label}>
                  <td className="px-3 py-2 font-medium text-slate-700">{label}</td>
                  {courses.map((course) => (
                    <td key={`${label}-${course.id}`} className="px-3 py-2 text-slate-700">
                      {getValue(course)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-6 rounded border bg-white p-4 text-sm text-slate-600">Select at least one approved course from the courses page to compare.</div>
      )}
    </div>
  );
}
