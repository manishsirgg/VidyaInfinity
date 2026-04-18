import type { Route } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export default async function InstitutesPage() {
  const supabase = await createClient();
  const { data: institutes } = await supabase
    .from("institutes")
    .select("id,name,description,status")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Institutes</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {institutes?.map((institute) => (
          <article key={institute.id} className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-medium">{institute.name}</h2>
            <p className="mt-2 text-sm text-slate-600 line-clamp-2">{institute.description ?? "No description available"}</p>
            <Link href={`/institutes/${institute.id}` as Route} className="mt-4 inline-block text-brand-600">
              View Institute
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
