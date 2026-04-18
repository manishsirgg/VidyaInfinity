import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function InstituteDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const statusAwareResponse = await supabase
    .from("institutes")
    .select("id,name,description,slug,status")
    .or(`id.eq.${slug},slug.eq.${slug}`)
    .eq("status", "approved")
    .maybeSingle();
  const instituteResponse = statusAwareResponse.error
    ? await supabase
        .from("institutes")
        .select("id,name,description,slug,approval_status")
        .or(`id.eq.${slug},slug.eq.${slug}`)
        .eq("approval_status", "approved")
        .maybeSingle()
    : statusAwareResponse;
  const institute = instituteResponse.data;

  if (!institute) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <article className="rounded-xl border bg-white p-8">
        <h1 className="text-3xl font-semibold">{institute.name}</h1>
        <p className="mt-6 text-slate-700">{institute.description ?? "No description available."}</p>
      </article>
    </div>
  );
}
