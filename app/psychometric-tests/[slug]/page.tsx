import { notFound } from "next/navigation";

import { PsychometricTestRunner } from "@/components/student/psychometric-test-runner";
import { createClient } from "@/lib/supabase/server";

export default async function TestDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: test } = await supabase
    .from("psychometric_tests")
    .select("id,title,description,price,is_active")
    .eq("slug", slug)
    .single();

  if (!test) notFound();

  let hasAccess = false;

  if (user) {
    const { data: paidOrder } = await supabase
      .from("psychometric_orders")
      .select("id")
      .eq("user_id", user.id)
      .eq("test_id", test.id)
      .eq("payment_status", "paid")
      .maybeSingle();

    hasAccess = Boolean(paidOrder);
  }

  const { data: questions } = hasAccess
    ? await supabase
        .from("psychometric_questions")
        .select("id,question_text,psychometric_question_options(id,option_label)")
        .eq("test_id", test.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <article className="rounded-xl border bg-white p-8">
        <h1 className="text-3xl font-semibold">{test.title}</h1>
        <p className="mt-4 text-slate-600">{test.description}</p>
        <p className="mt-6 text-2xl font-semibold">₹{test.price}</p>
        {!hasAccess && (
          <p className="mt-4 text-sm text-amber-700">
            Purchase this test to unlock questions and the report pipeline. Access is gated by paid psychometric_orders.
          </p>
        )}
      </article>

      {hasAccess && questions?.length ? <PsychometricTestRunner testId={test.id} questions={questions} /> : null}
    </div>
  );
}
