import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export default async function InstitutesPage() {
  const supabase = await createClient();
  const { data: institutes } = await supabase
    .from("institutes")
    .select("id,name,slug,city,approval_status")
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Institutes</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {institutes?.map((institute) => (
          <article key={institute.id} className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-medium">{institute.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{institute.city}</p>
            <Link href={`/institutes/${institute.slug}`} className="mt-4 inline-block text-brand-600">
              View Institute
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
