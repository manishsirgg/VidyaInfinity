import { notFound } from "next/navigation";

import { LeadForm } from "@/components/forms/lead-form";
import { createClient } from "@/lib/supabase/server";

export default async function CourseDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("id,title,summary,description,fee_amount,approval_status")
    .eq("slug", slug)
    .eq("approval_status", "approved")
    .single();

  if (!course) notFound();

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-[2fr_1fr]">
      <article className="rounded-xl border bg-white p-6">
        <h1 className="text-3xl font-semibold">{course.title}</h1>
        <p className="mt-4 text-slate-600">{course.summary}</p>
        <p className="mt-6">{course.description}</p>
      </article>
      <aside className="space-y-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-600">Course Fee</p>
          <p className="text-2xl font-semibold">₹{course.fee_amount}</p>
        </div>
        <LeadForm courseId={course.id} />
      </aside>
    </div>
  );
}
