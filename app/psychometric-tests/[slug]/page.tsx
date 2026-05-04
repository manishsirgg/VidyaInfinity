import { notFound } from "next/navigation";

import { PsychometricPurchaseCard } from "@/components/psychometric/psychometric-purchase-card";
import { PsychometricTestRunner } from "@/components/student/psychometric-test-runner";
import { createClient } from "@/lib/supabase/server";

export default async function TestDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("id,role").eq("id", user.id).maybeSingle<{ id: string; role: string }>() : { data: null };

  const { data: test } = await supabase
    .from("psychometric_tests")
    .select("id,title,description,price,is_active")
    .eq("slug", slug)
    .single();

  if (!test) notFound();

  let hasAccess = false;
  let purchaseLocked = false;

  if (profile?.role === "student") {
    const [{ data: paidOrder }, { data: unlockedAttempt }] = await Promise.all([
      supabase
        .from("psychometric_orders")
        .select("id")
        .eq("user_id", profile.id)
        .eq("test_id", test.id)
        .eq("payment_status", "paid")
        .maybeSingle(),
      supabase
        .from("test_attempts")
        .select("id,status")
        .eq("user_id", profile.id)
        .eq("test_id", test.id)
        .eq("status", "unlocked")
        .maybeSingle(),
    ]);

    hasAccess = Boolean(paidOrder || unlockedAttempt);
    purchaseLocked = hasAccess;
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
          <>
            <p className="mt-4 text-sm text-amber-700">
              Purchase this test to unlock questions and the report pipeline. Access is gated by paid psychometric_orders.
            </p>
            <PsychometricPurchaseCard testId={test.id} testTitle={test.title} price={Number(test.price ?? 0)} purchaseLocked={purchaseLocked} role={profile?.role ?? null} />
          </>
        )}
        {profile && profile.role !== "student" ? (
          <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {profile.role === "admin" ? "Student purchase required." : "Psychometric tests are available for student accounts only."}
          </p>
        ) : null}
      </article>

      {hasAccess && questions?.length ? <PsychometricTestRunner testId={test.id} questions={questions} /> : null}
    </div>
  );
}
