import { notFound } from "next/navigation";
import Link from "next/link";

import { InstituteMediaGallery } from "@/components/institutes/institute-media-gallery";
import { ShareActions } from "@/components/shared/share-actions";
import { getOrganizationTypeLabel } from "@/lib/constants/organization-types";
import { siteConfig } from "@/lib/constants/site";
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

  const baseInstituteColumns =
    "id,user_id,name,description,website_url,organization_type,legal_entity_name,registration_number,accreditation_affiliation_number,established_year,total_students,total_staff,verified";
  const statusAwareResponse = await admin.data
    .from("institutes")
    .select(`${baseInstituteColumns},slug,status`)
    .or(`id.eq.${slug},slug.eq.${slug}`)
    .eq("status", "approved")
    .maybeSingle();
  const statusAwareWithoutSlugResponse = statusAwareResponse.error
    ? await admin.data
        .from("institutes")
        .select(`${baseInstituteColumns},status`)
        .eq("id", slug)
        .eq("status", "approved")
        .maybeSingle()
    : statusAwareResponse;
  const approvalStatusResponse = statusAwareWithoutSlugResponse.error
    ? await admin.data
        .from("institutes")
        .select(`${baseInstituteColumns},slug,approval_status`)
        .or(`id.eq.${slug},slug.eq.${slug}`)
        .eq("approval_status", "approved")
        .maybeSingle()
    : statusAwareWithoutSlugResponse;
  const statusWithoutSlugResponse = approvalStatusResponse.error
    ? await admin.data
        .from("institutes")
        .select(`${baseInstituteColumns},status`)
        .eq("id", slug)
        .eq("status", "approved")
        .maybeSingle()
    : approvalStatusResponse;
  const instituteResponse = statusWithoutSlugResponse.error
    ? await admin.data
        .from("institutes")
        .select(`${baseInstituteColumns},approval_status`)
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
  const ownerDetails =
    instituteRecord?.user_id
      ? (
          await admin.data
            .from("user_additional_details")
            .select("address_line_1,address_line_2,postal_code")
            .eq("user_id", instituteRecord.user_id)
            .maybeSingle()
        ).data
      : fallbackProfile
        ? (
            await admin.data
              .from("user_additional_details")
              .select("address_line_1,address_line_2,postal_code")
              .eq("user_id", fallbackProfile.id)
              .maybeSingle()
          ).data
        : null;

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
    getOrganizationTypeLabel(("organization_type" in institute ? institute.organization_type : null) ?? ownerProfile?.organization_type ?? null);
  const instituteLegal = "legal_entity_name" in institute ? institute.legal_entity_name : null;
  const instituteRegistration = "registration_number" in institute ? institute.registration_number : null;
  const instituteAccreditation =
    "accreditation_affiliation_number" in institute ? institute.accreditation_affiliation_number : null;
  const instituteYear = "established_year" in institute ? institute.established_year : null;
  const instituteStudents = "total_students" in institute ? institute.total_students : null;
  const instituteStaff = "total_staff" in institute ? institute.total_staff : null;
  const instituteVerified = "verified" in institute ? institute.verified : null;
  const location = [ownerProfile?.city, ownerProfile?.state, ownerProfile?.country].filter(Boolean).join(", ");
  const fullAddress = [
    ownerDetails?.address_line_1,
    ownerDetails?.address_line_2,
    ownerProfile?.city,
    ownerProfile?.state,
    ownerProfile?.country,
    ownerDetails?.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
  const mapsEmbedUrl = fullAddress
    ? `https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`
    : null;
  const mapsOpenUrl = fullAddress ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}` : null;
  const shareUrl = `${siteConfig.url}/institutes/${slug}`;
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

  const instituteId = "id" in institute ? institute.id : null;
  const loadInstituteCourses = async () => {
    if (!instituteId) return { data: [] as Array<{ id: string; title: string; summary: string | null; fees: number | null; duration: string | null; slug?: string | null }>, error: null };

    const withSlug = await admin.data
      .from("courses")
      .select("id,title,summary,fees,duration,slug")
      .eq("institute_id", instituteId)
      .eq("status", "approved")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(6);

    if (!withSlug.error) return withSlug;

    const withoutSlug = await admin.data
      .from("courses")
      .select("id,title,summary,fees,duration")
      .eq("institute_id", instituteId)
      .eq("status", "approved")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(6);

    if (!withoutSlug.error) return withoutSlug;

    return admin.data
      .from("courses")
      .select("id,title,summary,fees,duration")
      .eq("institute_id", instituteId)
      .eq("approval_status", "approved")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(6);
  };

  const [courses, webinars] = instituteId
    ? await Promise.all([
        loadInstituteCourses(),
        admin.data
          .from("webinars")
          .select("id,title,description,starts_at,webinar_mode,price,currency")
          .eq("institute_id", instituteId)
          .eq("approval_status", "approved")
          .eq("is_deleted", false)
          .order("starts_at", { ascending: true })
          .limit(6),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <article className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-brand-50 via-white to-brand-50 p-8">
          <h1 className="text-3xl font-semibold">{instituteName}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{instituteDescription ?? "No description available."}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-brand-200 bg-white px-3 py-1 text-brand-700">{instituteType ?? "Institute"}</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">{location || "Location unavailable"}</span>
            {instituteVerified ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">Verified institute</span> : null}
          </div>
        </div>
        <div className="p-8">
        <ShareActions title={instituteName} text={instituteDescription ?? undefined} url={shareUrl} className="mt-3" />
        <InstituteMediaGallery mediaItems={mediaItems} instituteName={instituteName} />
        <div className="mt-6 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
          <p>
            <span className="font-medium">Type:</span> {instituteType ?? "-"}
          </p>
          <p>
            <span className="font-medium">Location:</span> {location || "-"}
          </p>
          <p>
            <span className="font-medium">Address:</span> {fullAddress || "-"}
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
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Courses</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(courses.data ?? []).map((course) => (
              <Link
                key={course.id}
                href={`/courses/${"slug" in course && course.slug ? course.slug : course.id}`}
                className="rounded-xl border bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"
              >
                <p className="line-clamp-2 font-semibold text-slate-900">{course.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{course.summary ?? "Explore this course for detailed curriculum and outcomes."}</p>
                <p className="mt-3 text-xs text-slate-500">₹{Number(course.fees ?? 0)} · {course.duration ?? "Flexible duration"}</p>
              </Link>
            ))}
            {(courses.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No published courses yet.</p> : null}
          </div>
        </section>
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Webinars</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(webinars.data ?? []).map((webinar) => (
              <Link key={webinar.id} href={`/webinars/${webinar.id}`} className="rounded-xl border bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
                <p className="line-clamp-2 font-semibold text-slate-900">{webinar.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{webinar.description ?? "Join this webinar to get live expert guidance."}</p>
                <p className="mt-3 text-xs text-slate-500">
                  {webinar.starts_at ? new Date(webinar.starts_at).toLocaleString("en-IN") : "Schedule TBD"} · {webinar.webinar_mode === "paid" ? `${webinar.currency ?? "INR"} ${Number(webinar.price ?? 0)}` : "Free"}
                </p>
              </Link>
            ))}
            {(webinars.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No upcoming webinars yet.</p> : null}
          </div>
        </section>
        {mapsEmbedUrl ? (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Find on Google Maps</h2>
            <div className="mt-3 overflow-hidden rounded-lg border">
              <iframe title={`${instituteName} map`} src={mapsEmbedUrl} className="h-72 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
            {mapsOpenUrl ? (
              <a href={mapsOpenUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-brand-700 hover:underline">
                Open in Google Maps
              </a>
            ) : null}
          </section>
        ) : null}
        </div>
      </article>
    </div>
  );
}
