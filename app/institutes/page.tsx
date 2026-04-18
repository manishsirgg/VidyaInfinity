import type { Route } from "next";
import Link from "next/link";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export default async function InstitutesPage() {
  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-semibold">Institutes</h1>
        <p className="mt-6 text-sm text-rose-700">Unable to load institutes right now.</p>
      </div>
    );
  }

  const statusAwareResponse = await admin.data
    .from("institutes")
    .select("id,user_id,name,description,slug,status")
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  const institutesResponse = statusAwareResponse.error
    ? await admin.data
        .from("institutes")
        .select("id,user_id,name,description,slug,approval_status")
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
    : statusAwareResponse;

  const institutes = (institutesResponse.data ?? []).map((institute) => ({
    id: institute.id,
    name: institute.name,
    description: institute.description,
    slug: institute.slug,
  }));

  const fallbackProfiles = institutes.length
    ? []
    : (
        await admin.data
          .from("profiles")
          .select("id,name,full_name,organization_name,approval_status,role")
          .eq("role", "institute")
          .eq("approval_status", "approved")
          .order("created_at", { ascending: false })
      ).data ?? [];

  const instituteCards = institutes.length
    ? institutes
    : fallbackProfiles.map((profile) => ({
        id: profile.id,
        name: profile.organization_name || profile.full_name || profile.name || "Institute",
        description: null as string | null,
        slug: null as string | null,
      }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Institutes</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {instituteCards.map((institute) => (
          <article key={institute.id} className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-medium">{institute.name}</h2>
            <p className="mt-2 text-sm text-slate-600 line-clamp-2">{institute.description ?? "No description available"}</p>
            <Link href={`/institutes/${institute.slug ?? institute.id}` as Route} className="mt-4 inline-block text-brand-600">
              View Institute
            </Link>
          </article>
        ))}
      </div>
      {instituteCards.length === 0 ? <p className="mt-6 text-sm text-slate-600">No institutes available yet.</p> : null}
    </div>
  );
}
