import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function TestDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: test } = await supabase
    .from("psychometric_tests")
    .select("id,title,description,price")
    .eq("slug", slug)
    .single();

  if (!test) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <article className="rounded-xl border bg-white p-8">
        <h1 className="text-3xl font-semibold">{test.title}</h1>
        <p className="mt-4 text-slate-600">{test.description}</p>
        <p className="mt-6 text-2xl font-semibold">₹{test.price}</p>
      </article>
    </div>
  );
}
