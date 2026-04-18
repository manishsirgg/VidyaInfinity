import { notFound } from "next/navigation";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export default async function InstituteDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) notFound();

  const statusAwareResponse = await admin.data
    .from("institutes")
    .select("id,name,description,slug,status")
    .or(`id.eq.${slug},slug.eq.${slug}`)
    .eq("status", "approved")
    .maybeSingle();
  const instituteResponse = statusAwareResponse.error
    ? await admin.data
        .from("institutes")
        .select("id,name,description,slug,approval_status")
        .or(`id.eq.${slug},slug.eq.${slug}`)
        .eq("approval_status", "approved")
        .maybeSingle()
    : statusAwareResponse;
  const institute =
    instituteResponse.data ??
    (
      await admin.data
        .from("profiles")
        .select("id,name,full_name,organization_name,approval_status,role")
        .eq("id", slug)
        .eq("role", "institute")
        .eq("approval_status", "approved")
        .maybeSingle()
    ).data;

  if (!institute) notFound();
  const instituteName =
    institute.name ??
    ("organization_name" in institute ? institute.organization_name : null) ??
    ("full_name" in institute ? institute.full_name : null) ??
    "Institute";
  const instituteDescription = "description" in institute ? institute.description : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <article className="rounded-xl border bg-white p-8">
        <h1 className="text-3xl font-semibold">{instituteName}</h1>
        <p className="mt-6 text-slate-700">{instituteDescription ?? "No description available."}</p>
      </article>
    </div>
  );
}
