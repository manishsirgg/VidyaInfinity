import type { Route } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export default async function InstitutesPage() {
  const supabase = await createClient();
  const statusAwareResponse = await supabase
    .from("institutes")
    .select("id,name,description,slug,status")
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  const institutesResponse = statusAwareResponse.error
    ? await supabase
        .from("institutes")
        .select("id,name,description,slug,approval_status")
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
    : statusAwareResponse;
  const institutes = institutesResponse.data ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Institutes</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {institutes.map((institute) => (
          <article key={institute.id} className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-medium">{institute.name}</h2>
            <p className="mt-2 text-sm text-slate-600 line-clamp-2">{institute.description ?? "No description available"}</p>
            <Link href={`/institutes/${institute.slug ?? institute.id}` as Route} className="mt-4 inline-block text-brand-600">
              View Institute
            </Link>
          </article>
        ))}
      </div>
      {institutes.length === 0 ? <p className="mt-6 text-sm text-slate-600">No institutes available yet.</p> : null}
    </div>
  );
}
