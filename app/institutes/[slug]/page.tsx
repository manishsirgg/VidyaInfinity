import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ArrowDown, ArrowLeft, BadgeCheck, Building2, CalendarDays, GraduationCap, Images, MapPin, Megaphone } from "lucide-react";
import { makeShareMetadata, resolveShareImage } from "@/lib/seo/share-metadata";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { InstituteSocialLinks } from "@/components/institutes/institute-social-links";
import { InstituteMediaGallery } from "@/components/institutes/institute-media-gallery";
import { InstituteCoursesCarousel } from "@/components/institutes/institute-courses-carousel";
import { ShareActions } from "@/components/shared/share-actions";
import { UpdateMediaViewer } from "@/components/shared/update-media-viewer";
import { getOrganizationTypeLabel } from "@/lib/constants/organization-types";
import { normalizeInstituteWebsite, readInstituteSocialLinks } from "@/lib/institutes/social-links";
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

// University/institute pages use their uploaded public image in shared link previews.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const fallback = makeShareMetadata({
    title: "Institutes & Universities | Vidya Infinity",
    description: "Explore verified institutes and universities on Vidya Infinity.",
    path: `/institutes/${encodeURIComponent(slug)}`,
  });
  const admin = getSupabaseAdmin();
  if (!admin.ok || !admin.data) return fallback;
  const db = admin.data;

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
  const select = "id,user_id,name,description";
  async function lookup(approvalColumn: "status" | "approval_status", bySlug: boolean) {
    const query = db.from("institutes").select(select);
    const locator = bySlug ? query.eq("slug", slug) : query.eq("id", slug);
    return locator.eq(approvalColumn, "approved").maybeSingle();
  }

  const attempts = uuid
    ? [await lookup("status", false), await lookup("approval_status", false)]
    : [await lookup("status", true), await lookup("approval_status", true)];
  const institute = attempts.find((result) => result.data)?.data;
  // Previous deployments allow profile-based institute pages by user ID.
  let profile: { organization_name?: string | null; full_name?: string | null; avatar_url?: string | null } | null = null;
  if (!institute && uuid) {
    const { data } = await db.from("profiles")
      .select("organization_name,full_name,avatar_url")
      .eq("id", slug)
      .eq("role", "institute")
      .eq("approval_status", "approved")
      .maybeSingle();
    profile = data;
  }
  if (!institute && !profile) return fallback;

  const name = institute?.name || profile?.organization_name || profile?.full_name || "Institute";
  const description = institute?.description || `Explore ${name}, courses, admissions and university information on Vidya Infinity.`;
  const instituteId = institute?.id ?? slug;
  const { data: media } = await db.from("institute_media")
    .select("file_url,media_type")
    .eq("institute_id", instituteId)
    .eq("media_type", "image")
    .order("created_at", { ascending: false })
    .limit(1);
  let image = resolveShareImage(media?.[0]?.file_url, "institute-media");
  if (!image && profile?.avatar_url) {
    const avatar = profile.avatar_url;
    image = /^https:\/\//i.test(avatar)
      ? avatar
      : process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/avatars/${avatar.replace(/^\/+/, "")}`
        : null;
  }
  return makeShareMetadata({
    title: `${name} | Vidya Infinity`,
    description,
    path: `/institutes/${encodeURIComponent(slug)}`,
    image,
  });
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

  // Keep the optional column out of historical lookup queries and profile-only records.
  const socialLinksRequest = instituteRecord
    ? Promise.resolve(
        admin.data.from("institutes")
          .select("social_links")
          .eq("id", instituteRecord.id)
          .eq("status" in instituteRecord ? "status" : "approval_status", "approved")
          .maybeSingle()
      )
    : Promise.resolve({ data: null });

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
    if (!instituteId) return { data: [] as Array<{ id: string; title: string; summary: string | null; fees: number | null; duration: string | null; slug?: string | null; course_media?: Array<{ file_url: string | null; type: string | null }> | null }>, error: null };

    const withSlug = await admin.data
      .from("courses")
      .select("id,title,summary,fees,duration,slug,course_media(file_url,type)")
      .eq("institute_id", instituteId)
      .eq("status", "approved")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!withSlug.error) return withSlug;

    const withoutSlug = await admin.data
      .from("courses")
      .select("id,title,summary,fees,duration,course_media(file_url,type)")
      .eq("institute_id", instituteId)
      .eq("status", "approved")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!withoutSlug.error) return withoutSlug;

    return admin.data
      .from("courses")
      .select("id,title,summary,fees,duration,course_media(file_url,type)")
      .eq("institute_id", instituteId)
      .eq("approval_status", "approved")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(100);
  };

  const [courses, webinars, instituteUpdates] = instituteId
    ? await Promise.all([
        loadInstituteCourses(),
        admin.data
          .from("webinars")
          .select("id,title,description,starts_at,webinar_mode,price,currency,thumbnail_url,banner_url")
          .eq("institute_id", instituteId)
          .eq("approval_status", "approved")
          .eq("is_deleted", false)
          .order("starts_at", { ascending: true })
          .limit(6),
        admin.data
          .from("institute_updates")
          .select("id,content,image_url,video_url,related_course_id,related_webinar_id,published_at,created_at")
          .eq("institute_id", instituteId)
          .eq("status", "approved")
          .is("deleted_at", null)
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(5),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const { data: socialLinks } = await socialLinksRequest;

  const description = instituteDescription?.trim();
  const intro = description && description.length > 250
    ? `${description.slice(0, 250).replace(/\s+\S*$/, "").trimEnd()}…`
    : description;
  const cover = mediaItems.find((item) => item.mediaType === "image" && item.url);
  const hasGallery = mediaItems.some((item) => item.url);
  const courseItems = courses.data ?? [];
  const webinarItems = webinars.data ?? [];
  const updates = instituteUpdates.data ?? [];
  const publicSocialLinks = readInstituteSocialLinks(socialLinks?.social_links);
  const websiteUrl = normalizeInstituteWebsite(instituteWebsite);
  const email = ownerProfile?.email?.trim();
  const phone = ownerProfile?.phone?.trim();
  const emailHref = email && /^[^\s@?#]+@[^\s@?#]+\.[^\s@?#]+$/.test(email) ? `mailto:${email.split("@").map(encodeURIComponent).join("@")}` : null;
  const phoneHref = phone && /^\+?[0-9][0-9 ().-]{6,29}$/.test(phone) ? `tel:${phone.replace(/[^+0-9]/g, "")}` : null;
  const hasContact = Boolean(instituteWebsite || email || phone || fullAddress || Object.keys(publicSocialLinks).length);
  const facts = [
    { label: "Legal entity", value: instituteLegal },
    { label: "Registration number", value: instituteRegistration },
    { label: "Accreditation number", value: instituteAccreditation },
    { label: "Students", value: instituteStudents },
    { label: "Staff", value: instituteStaff },
    { label: "Verification", value: instituteVerified === false ? "Not verified" : null },
  ].filter(({ value }) => value != null && String(value).trim());
  const hasOverview = Boolean((description && description !== intro) || facts.length);
  const navigation = [
    { id: "overview", label: "Overview", show: hasOverview },
    { id: "institute-courses", label: "Courses", show: courseItems.length },
    { id: "institute-webinars", label: "Webinars", show: webinarItems.length },
    { id: "institute-updates", label: "Updates", show: updates.length },
    { id: "institute-gallery", label: "Gallery", show: hasGallery },
    { id: "institute-location", label: "Location", show: mapsEmbedUrl },
    { id: "institute-contact", label: "Contact", show: hasContact },
  ].filter(({ show }) => show);
  const primaryLink = courseItems.length
    ? { href: "#institute-courses", label: "Explore courses" }
    : webinarItems.length
      ? { href: "#institute-webinars", label: "Explore webinars" }
      : hasContact
        ? { href: "#institute-contact", label: "Contact institute" }
        : null;

  return (
    <div data-institute-landing>
      <header className="bg-[radial-gradient(ellipse_at_top_right,_#174c78,_#072842_68%)] text-white">
        <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6 lg:px-8">
          <Link href="/institutes" className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-sky-100 hover:text-white hover:underline">
            <ArrowLeft className="size-4" aria-hidden="true" />
            All institutes
          </Link>
          <div className={`mt-5 grid items-center gap-6 sm:mt-6 lg:gap-12 ${cover ? "lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]" : ""}`}>
            <div className="min-w-0">
              {instituteType || instituteVerified ? (
                <ul className="mb-4 flex flex-wrap gap-2 text-xs font-medium sm:text-sm">
                  {instituteVerified ? (
                    <li className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">
                      <BadgeCheck className="size-4" aria-hidden="true" /> Verified institute
                    </li>
                  ) : null}
                  {instituteType ? <li className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sky-50">{instituteType}</li> : null}
                </ul>
              ) : null}
              <h1 className="max-w-4xl break-words text-4xl font-semibold leading-[1.08] text-white sm:text-5xl lg:text-6xl">{instituteName}</h1>
              {intro ? <p className="mt-4 max-w-2xl whitespace-pre-line break-words text-base leading-7 text-sky-50 sm:text-lg">{intro}</p> : null}
              {location || instituteYear ? (
                <dl className="mt-7 flex flex-wrap gap-x-7 gap-y-4 border-t border-white/20 pt-5">
                  {location ? (
                    <div className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 size-5 shrink-0 text-sky-200" aria-hidden="true" />
                      <div><dt className="text-xs text-sky-200">Location</dt><dd className="break-words text-sm font-medium">{location}</dd></div>
                    </div>
                  ) : null}
                  {instituteYear ? (
                    <div className="flex items-start gap-2.5">
                      <CalendarDays className="mt-0.5 size-5 shrink-0 text-sky-200" aria-hidden="true" />
                      <div><dt className="text-xs text-sky-200">Established</dt><dd className="text-sm font-medium">{instituteYear}</dd></div>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {primaryLink ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a href={primaryLink.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-900 transition hover:bg-sky-100">
                    {primaryLink.label} <ArrowDown className="size-4" aria-hidden="true" />
                  </a>
                  {hasContact && primaryLink.href !== "#institute-contact" ? (
                    <a href="#institute-contact" className="inline-flex min-h-11 items-center rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold hover:bg-white/10">Contact institute</a>
                  ) : null}
                </div>
              ) : null}
            </div>
            {cover?.url ? (
              <a href="#institute-gallery" aria-label="View institute gallery" className="relative block aspect-[16/10] overflow-hidden rounded-2xl border border-white/25 bg-brand-900 shadow-xl transition hover:border-white/70">
                <Image src={cover.url} alt="" fill sizes="(min-width: 1024px) 480px, 100vw" className="object-cover" unoptimized priority />
                <span className="absolute bottom-3 right-3 rounded-lg bg-slate-950/80 p-2 text-white"><Images className="size-4" aria-hidden="true" /></span>
              </a>
            ) : null}
          </div>
        </div>
      </header>

      {navigation.length ? (
        <div className="border-b border-slate-200 bg-white">
          <nav aria-label="Institute sections" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-sm font-medium text-slate-700 sm:px-6 lg:gap-x-7 lg:px-8">
            {navigation.map(({ id, label }) => (
              <a key={id} href={`#${id}`} className="inline-flex min-h-10 items-center rounded-sm hover:text-brand-700 hover:underline hover:underline-offset-4">{label}</a>
            ))}
          </nav>
        </div>
      ) : null}

      <div className={`mx-auto grid w-full max-w-6xl gap-7 px-4 py-7 sm:px-6 sm:py-9 lg:px-8 ${hasContact ? "lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-9" : ""}`}>
        {hasContact ? (
          <aside aria-labelledby="institute-contact-heading" className="min-w-0 lg:col-start-2 lg:row-start-1">
            <div id="institute-contact" className="scroll-mt-32 overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm lg:sticky lg:top-24">
              <h2 id="institute-contact-heading" className="border-b border-brand-100 bg-brand-50 px-5 py-4 text-lg font-semibold text-brand-900 sm:px-6">Contact institute</h2>
              <div className="p-5 sm:p-6">
                {email || phone || instituteWebsite || fullAddress ? (
                  <dl className="space-y-3 break-words text-sm">
                    {email ? <div><dt className="font-medium">Email</dt><dd>{emailHref ? <a href={emailHref} className="text-brand-700 hover:underline">{email}</a> : email}</dd></div> : null}
                    {phone ? <div><dt className="font-medium">Phone</dt><dd>{phoneHref ? <a href={phoneHref} className="text-brand-700 hover:underline">{phone}</a> : phone}</dd></div> : null}
                    {instituteWebsite ? <div><dt className="font-medium">Website</dt><dd>{websiteUrl ? <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">{instituteWebsite}</a> : instituteWebsite}</dd></div> : null}
                    {fullAddress ? <div><dt className="font-medium">Address</dt><dd className="text-slate-700">{fullAddress}</dd></div> : null}
                  </dl>
                ) : null}
                <InstituteSocialLinks links={publicSocialLinks} website={websiteUrl} />
              </div>
            </div>
          </aside>
        ) : null}

        <article className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
          {hasOverview ? (
            <InstituteSection id="overview" title="About this institute" icon={<Building2 className="size-5" aria-hidden="true" />}>
              {description && description !== intro ? <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 sm:text-base">{description}</p> : null}
              {facts.length ? (
                <dl className={`grid gap-3 sm:grid-cols-2 ${description && description !== intro ? "mt-5" : ""}`}>
                  {facts.map(({ label, value }) => (
                    <div key={label} className="min-w-0 rounded-xl bg-slate-50 px-4 py-3">
                      <dt className="text-xs font-medium text-slate-600">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </InstituteSection>
          ) : null}

          {courseItems.length ? (
            <InstituteSection id="institute-courses" title="Courses" icon={<GraduationCap className="size-5" aria-hidden="true" />}>
              <InstituteCoursesCarousel courseCount={courseItems.length}>
                {courseItems.map((course) => (
                  <Link
                    key={course.id}
                    href={`/courses/${"slug" in course && course.slug ? course.slug : course.id}`}
                    className="flex h-full min-w-0 snap-start flex-col rounded-xl border bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"
                  >
                    {(() => {
                      const courseCover = course.course_media?.find((media) => media.type === "image")?.file_url ?? null;
                      const courseCoverUrl = courseCover ? (/^https?:\/\//i.test(courseCover) ? courseCover : admin.data.storage.from("course-media").getPublicUrl(courseCover.replace(/^\/+/, "")).data.publicUrl) : null;
                      return courseCoverUrl ? <Image src={courseCoverUrl} alt={`${course.title} cover`} width={1280} height={720} className="mb-3 aspect-video w-full rounded-md border bg-slate-50 object-contain" /> : null;
                    })()}
                    <p className="line-clamp-2 font-semibold text-slate-900">{course.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{course.summary ?? "Explore this course for detailed curriculum and outcomes."}</p>
                    <p className="mt-3 text-xs text-slate-500">₹{Number(course.fees ?? 0)} · {course.duration ?? "Flexible duration"}</p>
                  </Link>
                ))}
              </InstituteCoursesCarousel>
            </InstituteSection>
          ) : null}

          {webinarItems.length ? (
            <InstituteSection id="institute-webinars" title="Webinars" icon={<CalendarDays className="size-5" aria-hidden="true" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                {webinarItems.map((webinar) => (
                  <Link key={webinar.id} href={`/webinars/${webinar.id}`} className="rounded-xl border bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
                    {(() => {
                      const webinarImage = webinar.thumbnail_url ?? webinar.banner_url ?? null;
                      return webinarImage ? <Image src={webinarImage} alt={`${webinar.title} cover`} width={1280} height={720} className="mb-3 aspect-video w-full rounded-md border bg-slate-50 object-contain" /> : null;
                    })()}
                    <p className="line-clamp-2 font-semibold text-slate-900">{webinar.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{webinar.description ?? "Join this webinar to get live expert guidance."}</p>
                    <p className="mt-3 text-xs text-slate-500">
                      {webinar.starts_at ? new Date(webinar.starts_at).toLocaleString("en-IN") : "Schedule TBD"} · {webinar.webinar_mode === "paid" ? `${webinar.currency ?? "INR"} ${Number(webinar.price ?? 0)}` : "Free"}
                    </p>
                  </Link>
                ))}
              </div>
            </InstituteSection>
          ) : null}

          {updates.length ? (
            <InstituteSection id="institute-updates" title="Latest updates" icon={<Megaphone className="size-5" aria-hidden="true" />}>
              <div className="space-y-3">
                {updates.map((update) => (
                  <article key={update.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{update.content}</p>
                    {update.image_url ? <UpdateMediaViewer mediaType="image" src={update.image_url} alt="Institute update" /> : null}
                    {update.video_url ? <UpdateMediaViewer mediaType="video" src={update.video_url} alt="Institute update" /> : null}
                    <p className="mt-2 text-xs text-slate-500">Posted on {new Date(update.published_at ?? update.created_at).toLocaleDateString("en-IN")}</p>
                  </article>
                ))}
              </div>
            </InstituteSection>
          ) : null}

          {hasGallery ? (
            <InstituteSection id="institute-gallery" title="Institute gallery" icon={<Images className="size-5" aria-hidden="true" />}>
              <InstituteMediaGallery mediaItems={mediaItems} instituteName={instituteName} />
            </InstituteSection>
          ) : null}

          {mapsEmbedUrl && mapsOpenUrl ? (
            <InstituteSection id="institute-location" title="Find this institute" icon={<MapPin className="size-5" aria-hidden="true" />}>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <iframe title={`${instituteName} map`} src={mapsEmbedUrl} className="h-72 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
              <a href={mapsOpenUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center rounded-sm text-sm font-semibold text-brand-700 hover:underline">
                Open in Google Maps
              </a>
            </InstituteSection>
          ) : null}
          <ShareActions title={instituteName} text={description || undefined} url={shareUrl} className="px-1 pt-1" />
        </article>
      </div>
    </div>
  );
}

function InstituteSection({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-32 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
        <h2 id={`${id}-heading`} className="text-xl font-semibold sm:text-2xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}
