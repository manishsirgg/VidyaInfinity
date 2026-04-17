import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function InstituteDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: institute } = await supabase
    .from("institutes")
    .select("id,name,description,city,approval_status")
    .eq("slug", slug)
    .eq("approval_status", "approved")
    .single();

  if (!institute) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <article className="rounded-xl border bg-white p-8">
        <h1 className="text-3xl font-semibold">{institute.name}</h1>
        <p className="mt-2 text-slate-500">{institute.city}</p>
        <p className="mt-6 text-slate-700">{institute.description}</p>
      </article>
    </div>
  );
}
