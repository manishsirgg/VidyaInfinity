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
          <Link href={`/psychometric-tests/${test.slug}` as Route} key={test.id} className="group rounded-xl border bg-white p-5 transition hover:border-brand-300">
          <article>
            <h2 className="text-lg font-medium">{test.title}</h2>
            <p className="mt-2 text-sm">₹{test.price}</p>
            <p className="mt-4 inline-block text-brand-600 group-hover:underline">Buy Test</p>
          </article>
        </Link>
        ))}
      </div>
    </div>
  );
}
