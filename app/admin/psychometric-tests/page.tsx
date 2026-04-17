import { PsychometricQuestionBuilder } from "@/components/admin/psychometric-question-builder";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: tests } = await supabase
    .from("psychometric_tests")
    .select("id,title,price,is_active")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Psychometric Tests</h1>
      <div className="mt-4 space-y-3">
        {tests?.map((test) => (
          <div key={test.id} className="rounded border bg-white p-3 text-sm">
            <p>
              {test.title} · ₹{test.price} · {test.is_active ? "active" : "inactive"}
            </p>
            <PsychometricQuestionBuilder testId={test.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
