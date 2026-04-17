import type { Route } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export default async function PsychometricTestsPage() {
  const supabase = await createClient();
  const { data: tests } = await supabase
    .from("psychometric_tests")
    .select("id,title,slug,price,is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Psychometric Tests</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {tests?.map((test) => (
          <article key={test.id} className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-medium">{test.title}</h2>
            <p className="mt-2 text-sm">₹{test.price}</p>
            <Link href={`/psychometric-tests/${test.slug}` as Route} className="mt-4 inline-block text-brand-600">
              Buy Test
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
