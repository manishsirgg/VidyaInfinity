import { notFound } from "next/navigation";

import { InstituteMediaGallery } from "@/components/institutes/institute-media-gallery";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

export default async function InstituteDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = getSupabaseAdmin();
  if (!admin.ok) notFound();

  const statusAwareResponse = await admin.data
    .from("institutes")
    .select(
      "id,user_id,name,description,slug,status,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified"
    )
    .or(`id.eq.${slug},slug.eq.${slug}`)
    .eq("status", "approved")
    .maybeSingle();
  const approvalStatusResponse = statusAwareResponse.error
    ? await admin.data
        .from("institutes")
        .select(
          "id,user_id,name,description,slug,approval_status,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified"
        )
        .or(`id.eq.${slug},slug.eq.${slug}`)
        .eq("approval_status", "approved")
        .maybeSingle()
    : statusAwareResponse;
  const statusWithoutSlugResponse = approvalStatusResponse.error
    ? await admin.data
        .from("institutes")
        .select(
          "id,user_id,name,description,status,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified"
        )
        .eq("id", slug)
        .eq("status", "approved")
        .maybeSingle()
    : approvalStatusResponse;
  const instituteResponse = statusWithoutSlugResponse.error
    ? await admin.data
        .from("institutes")
        .select(
          "id,user_id,name,description,approval_status,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified"
        )
        .eq("id", slug)
        .eq("approval_status", "approved")
        .maybeSingle()
    : statusWithoutSlugResponse;
  const instituteRecord = instituteResponse.data;
  const fallbackProfile =
    instituteRecord
      ? null
      : (
          await admin.data
            .from("profiles")
            .select("id,name,full_name,organization_name,organization_type,email,phone,city,state,country,approval_status,role")
            .eq("id", slug)
            .eq("role", "institute")
            .eq("approval_status", "approved")
            .maybeSingle()
        ).data;

  const ownerProfile =
    instituteRecord?.user_id
      ? (
          await admin.data
            .from("profiles")
            .select("id,name,full_name,organization_name,organization_type,email,phone,city,state,country")
            .eq("id", instituteRecord.user_id)
            .maybeSingle()
        ).data
      : fallbackProfile;

  const institute =
    instituteResponse.data ??
    fallbackProfile;

  if (!institute) notFound();
  const instituteName =
    institute.name ??
    ("organization_name" in institute ? institute.organization_name : null) ??
    ("full_name" in institute ? institute.full_name : null) ??
    "Institute";
  const instituteDescription = "description" in institute ? institute.description : null;
  const instituteWebsite = "website_url" in institute ? institute.website_url : null;
  const instituteType =
    ("organization_type" in institute ? institute.organization_type : null) ?? ownerProfile?.organization_type ?? null;
  const instituteLegal = "legal_entity_name" in institute ? institute.legal_entity_name : null;
  const instituteRegistration = "registration_number" in institute ? institute.registration_number : null;
  const instituteAccreditation =
    "accreditation_affiliation_number" in institute ? institute.accreditation_affiliation_number : null;
  const instituteYear = "established_year" in institute ? institute.established_year : null;
  const instituteStudents = "total_students" in institute ? institute.total_students : null;
  const instituteStaff = "total_staff" in institute ? institute.total_staff : null;
  const instituteVerified = "verified" in institute ? institute.verified : null;
  const location = [ownerProfile?.city, ownerProfile?.state, ownerProfile?.country].filter(Boolean).join(", ");
  const mediaRows =
    "id" in institute
      ? (
          await admin.data
            .from("institute_media")
            .select("id,media_type,file_url,file_name")
            .eq("institute_id", institute.id)
            .order("created_at", { ascending: false })
        ).data ?? []
      : [];
  const mediaItems = mediaRows.map((item) => ({
    id: item.id,
    mediaType: item.media_type,
    url: toPublicMediaUrl(admin.data, item.file_url),
    fileName: item.file_name,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <article className="rounded-xl border bg-white p-8">
        <h1 className="text-3xl font-semibold">{instituteName}</h1>
        <InstituteMediaGallery mediaItems={mediaItems} instituteName={instituteName} />
        <p className="mt-6 text-slate-700">{instituteDescription ?? "No description available."}</p>
        <div className="mt-6 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <p>
            <span className="font-medium">Type:</span> {instituteType ?? "-"}
          </p>
          <p>
            <span className="font-medium">Location:</span> {location || "-"}
          </p>
          <p>
            <span className="font-medium">Established:</span> {instituteYear ?? "-"}
          </p>
          <p>
            <span className="font-medium">Website:</span> {instituteWebsite ?? "-"}
          </p>
          <p>
            <span className="font-medium">Email:</span> {ownerProfile?.email ?? "-"}
          </p>
          <p>
            <span className="font-medium">Phone:</span> {ownerProfile?.phone ?? "-"}
          </p>
          <p>
            <span className="font-medium">Students:</span> {instituteStudents ?? "-"}
          </p>
          <p>
            <span className="font-medium">Staff:</span> {instituteStaff ?? "-"}
          </p>
          <p>
            <span className="font-medium">Verified:</span> {instituteVerified == null ? "-" : instituteVerified ? "Yes" : "No"}
          </p>
          <p>
            <span className="font-medium">Legal entity:</span> {instituteLegal ?? "-"}
          </p>
          <p>
            <span className="font-medium">Registration #:</span> {instituteRegistration ?? "-"}
          </p>
          <p>
            <span className="font-medium">Accreditation #:</span> {instituteAccreditation ?? "-"}
          </p>
        </div>
      </article>
    </div>
  );
}
