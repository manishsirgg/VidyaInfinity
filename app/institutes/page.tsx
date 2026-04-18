import type { Route } from "next";
import Link from "next/link";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type InstituteRecord = {
  id: string;
  user_id: string | null;
  slug?: string | null;
  name: string | null;
  description: string | null;
  website_url: string | null;
  organization_type: string | null;
  legal_entity_name: string | null;
  registration_number: string | null;
  accreditation_affiliation_number: string | null;
  established_year: number | null;
  total_students: number | null;
  total_staff: number | null;
  verified: boolean | null;
};

type ProfileRecord = {
  id: string;
  name: string | null;
  full_name: string | null;
  organization_name: string | null;
  organization_type: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

type InstituteMediaRecord = {
  id: string;
  institute_id: string;
  media_type: "image" | "video";
  file_url: string;
  file_name: string | null;
};

function toPublicMediaUrl(
  adminClient: { storage: { from: (bucket: string) => { getPublicUrl: (path: string) => { data: { publicUrl: string } } } } },
  fileUrl: string | null | undefined
) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const normalized = fileUrl.replace(/^\/+/, "");
  const instituteMediaUrl = adminClient.storage.from("institute-media").getPublicUrl(normalized).data.publicUrl;
  const blogMediaUrl = adminClient.storage.from("blog-media").getPublicUrl(normalized).data.publicUrl;
  return instituteMediaUrl || blogMediaUrl || null;
}

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
    .select(
      "id,user_id,name,description,slug,status,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified"
    )
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  const approvalStatusResponse = statusAwareResponse.error
    ? await admin.data
        .from("institutes")
        .select(
          "id,user_id,name,description,slug,approval_status,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified"
        )
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
    : statusAwareResponse;
  const statusWithoutSlugResponse = approvalStatusResponse.error
    ? await admin.data
        .from("institutes")
        .select(
          "id,user_id,name,description,status,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified"
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false })
    : approvalStatusResponse;
  const institutesResponse = statusWithoutSlugResponse.error
    ? await admin.data
        .from("institutes")
        .select(
          "id,user_id,name,description,approval_status,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified"
        )
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
    : statusWithoutSlugResponse;
  const instituteRows = (institutesResponse.data ?? []) as InstituteRecord[];
  const instituteIds = instituteRows.map((item) => item.id);
  const mediaRows = instituteIds.length
    ? (
        await admin.data
          .from("institute_media")
          .select("id,institute_id,media_type,file_url,file_name")
          .in("institute_id", instituteIds)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];
  const mediaByInstituteId = new Map<string, InstituteMediaRecord[]>();
  for (const media of mediaRows as InstituteMediaRecord[]) {
    const existing = mediaByInstituteId.get(media.institute_id) ?? [];
    existing.push(media);
    mediaByInstituteId.set(media.institute_id, existing);
  }

  const profileIds = [...new Set(instituteRows.map((institute) => institute.user_id).filter(Boolean))] as string[];
  const profileRows = profileIds.length
    ? (
        await admin.data
          .from("profiles")
          .select("id,name,full_name,organization_name,organization_type,email,phone,city,state,country")
          .in("id", profileIds)
      ).data ?? []
    : [];
  const profileById = new Map((profileRows as ProfileRecord[]).map((profile) => [profile.id, profile]));

  const institutes = instituteRows.map((institute) => {
    const profile = institute.user_id ? profileById.get(institute.user_id) : undefined;
    return {
      id: institute.id,
      slug: institute.slug ?? null,
      name: institute.name || profile?.organization_name || profile?.full_name || profile?.name || "Institute",
      description: institute.description,
      websiteUrl: institute.website_url,
      organizationType: institute.organization_type || profile?.organization_type || null,
      legalEntityName: institute.legal_entity_name,
      registrationNumber: institute.registration_number,
      accreditationNumber: institute.accreditation_affiliation_number,
      establishedYear: institute.established_year,
      totalStudents: institute.total_students,
      totalStaff: institute.total_staff,
      verified: institute.verified,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      city: profile?.city ?? null,
      state: profile?.state ?? null,
      country: profile?.country ?? null,
      media: (mediaByInstituteId.get(institute.id) ?? []).map((item) => ({
        id: item.id,
        mediaType: item.media_type,
        url: toPublicMediaUrl(admin.data, item.file_url),
        fileName: item.file_name,
      })),
    };
  });

  const fallbackProfiles = institutes.length
    ? []
    : (
        await admin.data
          .from("profiles")
          .select("id,name,full_name,organization_name,organization_type,email,phone,city,state,country,approval_status,role")
          .eq("role", "institute")
          .eq("approval_status", "approved")
          .order("created_at", { ascending: false })
      ).data ?? [];

  const instituteCards = institutes.length
    ? institutes
    : fallbackProfiles.map((profile) => ({
        id: profile.id,
        slug: null as string | null,
        name: profile.organization_name || profile.full_name || profile.name || "Institute",
        description: null as string | null,
        websiteUrl: null as string | null,
        organizationType: profile.organization_type ?? null,
        legalEntityName: null as string | null,
        registrationNumber: null as string | null,
        accreditationNumber: null as string | null,
        establishedYear: null as number | null,
        totalStudents: null as number | null,
        totalStaff: null as number | null,
        verified: null as boolean | null,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        city: profile.city ?? null,
        state: profile.state ?? null,
        country: profile.country ?? null,
        media: [] as { id: string; mediaType: "image" | "video"; url: string | null; fileName: string | null }[],
      }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Institutes</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {instituteCards.map((institute) => (
          <article key={institute.id} className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-medium">{institute.name}</h2>
            {institute.media.length > 0 ? (
              <div className="mt-3">
                {institute.media[0].mediaType === "video" ? (
                  <video className="h-44 w-full rounded-md border object-cover" controls src={institute.media[0].url ?? undefined} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="h-44 w-full rounded-md border object-cover"
                    src={institute.media[0].url ?? ""}
                    alt={institute.media[0].fileName ?? `${institute.name} media`}
                  />
                )}
                {institute.media.length > 1 ? (
                  <p className="mt-1 text-xs text-slate-500">+{institute.media.length - 1} more media file(s)</p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-2 text-sm text-slate-600">{institute.description ?? "No description available."}</p>
            <div className="mt-3 space-y-1 text-xs text-slate-600">
              <p>Type: {institute.organizationType ?? "-"}</p>
              <p>
                Location: {[institute.city, institute.state, institute.country].filter(Boolean).join(", ") || "-"}
              </p>
              <p>Established: {institute.establishedYear ?? "-"}</p>
              <p>
                Students: {institute.totalStudents ?? "-"} · Staff: {institute.totalStaff ?? "-"}
              </p>
              <p>Website: {institute.websiteUrl ?? "-"}</p>
              <p>Email: {institute.email ?? "-"} · Phone: {institute.phone ?? "-"}</p>
              <p>Verified: {institute.verified == null ? "-" : institute.verified ? "Yes" : "No"}</p>
              <p>Legal entity: {institute.legalEntityName ?? "-"}</p>
              <p>Registration #: {institute.registrationNumber ?? "-"}</p>
              <p>Accreditation #: {institute.accreditationNumber ?? "-"}</p>
            </div>
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
