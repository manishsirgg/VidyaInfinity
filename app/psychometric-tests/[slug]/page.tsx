import { notFound } from "next/navigation";
import Image from "next/image";

import { PsychometricPurchaseCard } from "@/components/psychometric/psychometric-purchase-card";
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
    .select("id,title,description,price,is_active,duration_minutes,instructions,metadata")
    .eq("slug", slug)
    .single();

  if (!test) notFound();

  let hasAccess = false;
  let purchaseLocked = false;
  let entitlement: { attemptId: string | null; reportId: string | null; redirectTo: string } | null = null;

  if (profile?.role === "student") {
    const [{ data: paidOrder }, { data: unlockedAttempt }] = await Promise.all([
      supabase
        .from("psychometric_orders")
        .select("id,attempt_id,payment_status")
        .eq("user_id", profile.id)
        .eq("test_id", test.id)
        .in("payment_status", ["paid", "success", "captured", "confirmed"])
        .order("created_at", { ascending: false })
        .maybeSingle(),
      supabase
        .from("test_attempts")
        .select("id,status,report_id")
        .eq("user_id", profile.id)
        .eq("test_id", test.id)
        .in("status", ["not_started", "unlocked", "in_progress", "submitted", "completed"])
        .order("created_at", { ascending: false })
        .maybeSingle(),
    ]);

    hasAccess = Boolean(paidOrder || unlockedAttempt);
    purchaseLocked = hasAccess;
    const attemptId = unlockedAttempt?.id ?? paidOrder?.attempt_id ?? null;
    const reportId = unlockedAttempt?.report_id ?? null;
    const redirectTo = reportId
      ? `/dashboard/psychometric/reports/${reportId}`
      : attemptId
        ? `/dashboard/psychometric/attempts/${attemptId}`
        : "/student/purchases?kind=psychometric";
    entitlement = hasAccess ? { attemptId, reportId, redirectTo } : null;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <article className="rounded-xl border bg-white p-8">
        {typeof test.metadata === "object" && test.metadata && typeof (test.metadata as Record<string, unknown>).banner_image_url === "string" ? (
          <Image
            src={String((test.metadata as Record<string, unknown>).banner_image_url)}
            alt={`${test.title} banner`}
            width={1200}
            height={420}
            className="mb-6 h-56 w-full rounded-xl object-cover"
            unoptimized
          />
        ) : null}
        <h1 className="text-3xl font-semibold">{test.title}</h1>
        <p className="mt-4 text-slate-600">{test.description}</p>
        <p className="mt-6 text-2xl font-semibold">₹{test.price}</p>
        {typeof test.duration_minutes === "number" ? <p className="mt-2 text-sm text-slate-500">Duration: {test.duration_minutes} minutes</p> : null}
        {test.instructions ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Instructions</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{test.instructions}</p>
          </div>
        ) : null}
        {!hasAccess ? (
          <p className="mt-4 text-sm text-amber-700">Buy Now to unlock this psychometric test.</p>
        ) : (
          <p className="mt-4 text-sm text-emerald-700">You already purchased this test. Continue using the protected dashboard route.</p>
        )}
        <PsychometricPurchaseCard
          testId={test.id}
          testTitle={test.title}
          price={Number(test.price ?? 0)}
          purchaseLocked={purchaseLocked}
          role={profile?.role ?? null}
          entitlement={entitlement}
        />
        {profile && profile.role !== "student" ? (
          <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {profile.role === "admin" ? "Student purchase required." : "Psychometric tests are available for student accounts only."}
          </p>
        ) : null}
      </article>
    </div>
  );
}
