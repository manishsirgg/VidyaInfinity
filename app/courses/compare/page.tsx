import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

type CompareCourse = {
  id: string;
  title: string;
  summary: string | null;
  fees: number | null;
  duration: string | null;
  mode: string | null;
  category: string | null;
  subject: string | null;
  level: string | null;
  language: string | null;
  certificate_status: string | null;
  batch_size: number | null;
  placement_support: string | null;
  internship_support: string | null;
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
        .select("id,title,summary,fees,duration,mode,category,subject,level,language,certificate_status,batch_size,placement_support,internship_support,status")
        .in("id", ids)
        .eq("status", "approved")
    : { data: [] };

  const courses: CompareCourse[] = (data ?? []) as CompareCourse[];

  const rows: Array<[string, (course: CompareCourse) => string]> = [
    ["Course", (course) => course.title],
    ["Summary", (course) => val(course.summary)],
    ["Fees", (course) => `₹${val(course.fees)}`],
    ["Duration", (course) => val(course.duration)],
    ["Mode", (course) => val(course.mode)],
    ["Category", (course) => `${val(course.category)} / ${val(course.subject)}`],
    ["Level", (course) => val(course.level)],
    ["Language", (course) => val(course.language)],
    ["Certificate", (course) => val(course.certificate_status)],
    ["Batch size", (course) => val(course.batch_size)],
    ["Placement", (course) => val(course.placement_support)],
    ["Internship", (course) => val(course.internship_support)],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Compare Courses</h1>
        <Link href="/courses" className="text-sm text-brand-600">
          Back to courses
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-600">Compare approved courses side by side across key details.</p>

      {courses.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full divide-y text-sm">
            <thead>
              <tr>
                <th className="bg-slate-50 px-3 py-2 text-left">Field</th>
                {courses.map((course) => (
                  <th key={course.id} className="bg-slate-50 px-3 py-2 text-left">{course.title}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(([label, getValue]) => (
                <tr key={label}>
                  <td className="px-3 py-2 font-medium text-slate-700">{label}</td>
                  {courses.map((course) => (
                    <td key={`${label}-${course.id}`} className="px-3 py-2 text-slate-700">{getValue(course)}</td>
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
