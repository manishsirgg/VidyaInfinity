import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";

import { NewsletterForm } from "@/components/shared/newsletter-form";
import { HomeCategoryBrowser } from "@/components/home/home-category-browser";
import { getOrganizationTypeLabel } from "@/lib/constants/organization-types";
import { getPublicFileUrl } from "@/lib/storage/uploads";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { expireWebinarFeaturedSubscriptionsSafe } from "@/lib/webinar-featured";

export default async function HomePage() {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;
  if (admin.ok) {
    await expireWebinarFeaturedSubscriptionsSafe(admin.data);
  }

  const { data: listedCourses } = await dataClient
    .from("courses")
    .select("id,title,summary,fees,category,subject,level,language,duration,mode,status,course_media(file_url,type)")
    .eq("status", "approved")
    .eq("is_deleted", false)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: false })
    .limit(18);
  const [{ data: activeFeaturedCourseRows }, { data: courseFeaturedSummaryRows }] = await Promise.all([
    dataClient.from("active_featured_courses").select("course_id"),
    dataClient.from("course_featured_subscription_summary").select("course_id,starts_at,ends_at"),
  ]);
  const [{ data: featuredWebinarRows }, { data: listedWebinars }] = await Promise.all([
    dataClient.from("active_featured_webinars").select("webinar_id"),
    dataClient
      .from("webinars")
      .select("id,title,starts_at,webinar_mode,price,currency,thumbnail_url,status,approval_status")
      .eq("approval_status", "approved")
      .eq("is_public", true)
      .in("status", ["scheduled", "live"])
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .order("starts_at", { ascending: true })
      .limit(24),
  ]);

  const instituteSelectWithSlug = "id,user_id,slug,name,description,organization_type,website_url,verified";
  const instituteSelectWithoutSlug = "id,user_id,name,description,organization_type,website_url,verified";
  const statusAwareInstitutes = await dataClient
    .from("institutes")
    .select(`${instituteSelectWithSlug},status`)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(18);
  const statusAwareInstitutesWithoutSlug = statusAwareInstitutes.error
    ? await dataClient
        .from("institutes")
        .select(`${instituteSelectWithoutSlug},status`)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(18)
    : statusAwareInstitutes;
  const approvalAwareInstitutes = statusAwareInstitutesWithoutSlug.error
    ? await dataClient
        .from("institutes")
        .select(`${instituteSelectWithSlug},approval_status`)
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
        .limit(18)
    : statusAwareInstitutesWithoutSlug;
  const approvalAwareInstitutesWithoutSlug = approvalAwareInstitutes.error
    ? await dataClient
        .from("institutes")
        .select(`${instituteSelectWithoutSlug},approval_status`)
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
        .limit(18)
    : approvalAwareInstitutes;
  const listedInstitutes = (approvalAwareInstitutesWithoutSlug.data ?? []) as Array<{
    id: string;
    user_id: string | null;
    slug?: string | null;
    name: string | null;
    description: string | null;
    organization_type: string | null;
    website_url: string | null;
    verified: boolean | null;
  }>;

  const profileIds = [...new Set(listedInstitutes.map((institute) => institute.user_id).filter(Boolean))] as string[];
  const profileRows = profileIds.length
    ? (
        await dataClient
          .from("profiles")
          .select("id,name,full_name,organization_name,organization_type,city,state,country,email,phone,avatar_url")
          .in("id", profileIds)
      ).data ?? []
    : [];
  const profileById = new Map(
    (
      profileRows as Array<{
        id: string;
        name: string | null;
        full_name: string | null;
        organization_name: string | null;
        organization_type: string | null;
        city: string | null;
        state: string | null;
        country: string | null;
        email: string | null;
        phone: string | null;
        avatar_url: string | null;
      }>
    ).map((profile) => [profile.id, profile]),
  );
  const additionalDetailsRows = profileIds.length
    ? (
        await dataClient
          .from("user_additional_details")
          .select("user_id,address_line_1,address_line_2,postal_code")
          .in("user_id", profileIds)
      ).data ?? []
    : [];
  const additionalDetailsByUserId = new Map(
    (
      additionalDetailsRows as Array<{
        user_id: string;
        address_line_1: string | null;
        address_line_2: string | null;
        postal_code: string | null;
      }>
    ).map((item) => [item.user_id, item]),
  );

  const mappedInstitutes = listedInstitutes.map((institute) => {
    const profile = institute.user_id ? profileById.get(institute.user_id) : undefined;
    const details = institute.user_id ? additionalDetailsByUserId.get(institute.user_id) : undefined;
    return {
      ...institute,
      name: institute.name || profile?.organization_name || profile?.full_name || profile?.name || "Institute",
      organization_type: getOrganizationTypeLabel(institute.organization_type || profile?.organization_type || null),
      city: profile?.city ?? null,
      state: profile?.state ?? null,
      country: profile?.country ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      avatar_url: profile?.avatar_url ?? null,
      address_line_1: details?.address_line_1 ?? null,
      address_line_2: details?.address_line_2 ?? null,
      postal_code: details?.postal_code ?? null,
    };
  });

  const fallbackProfiles = mappedInstitutes.length
    ? []
    : (
        await dataClient
          .from("profiles")
          .select("id,name,full_name,organization_name,organization_type,city,state,country,email,phone,avatar_url,approval_status,role")
          .eq("role", "institute")
          .eq("approval_status", "approved")
          .order("created_at", { ascending: false })
          .limit(18)
      ).data ?? [];

  const institutesForHome = mappedInstitutes.length
    ? mappedInstitutes
    : fallbackProfiles.map((profile) => ({
        id: profile.id,
        user_id: profile.id,
        slug: null as string | null,
        name: profile.organization_name || profile.full_name || profile.name || "Institute",
        description: null as string | null,
        organization_type: getOrganizationTypeLabel(profile.organization_type ?? null),
        city: profile.city ?? null,
        state: profile.state ?? null,
        country: profile.country ?? null,
        email: profile.email ?? null,
        phone: profile.phone ?? null,
        avatar_url: profile.avatar_url ?? null,
        address_line_1: null as string | null,
        address_line_2: null as string | null,
        postal_code: null as string | null,
        website_url: null as string | null,
        verified: null as boolean | null,
      }));

  const instituteMediaLookupIds = [...new Set(institutesForHome.flatMap((institute) => [institute.id, institute.user_id].filter(Boolean)))] as string[];
  const instituteMediaRows = instituteMediaLookupIds.length
    ? (
        await dataClient
          .from("institute_media")
          .select("institute_id,media_type,file_url")
          .in("institute_id", instituteMediaLookupIds)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];
  const instituteImageById = new Map<string, string>();
  for (const media of instituteMediaRows as Array<{ institute_id: string; media_type: string | null; file_url: string | null }>) {
    if (!media.file_url || String(media.media_type ?? "").toLowerCase() !== "image") continue;
    if (!instituteImageById.has(media.institute_id)) {
      const mediaUrl = /^https?:\/\//i.test(media.file_url)
        ? media.file_url
        : getPublicFileUrl({ bucket: "institute-media", path: media.file_url }) ?? getPublicFileUrl({ bucket: "blog-media", path: media.file_url });
      if (mediaUrl) instituteImageById.set(media.institute_id, mediaUrl);
    }
  }
  for (const institute of institutesForHome) {
    if (!instituteImageById.has(institute.id) && institute.user_id && instituteImageById.has(institute.user_id)) {
      instituteImageById.set(institute.id, instituteImageById.get(institute.user_id) ?? "");
    }
    if (!instituteImageById.has(institute.id) && institute.avatar_url) {
      const avatarUrl = /^https?:\/\//i.test(institute.avatar_url)
        ? institute.avatar_url
        : getPublicFileUrl({ bucket: "avatars", path: institute.avatar_url });
      if (avatarUrl) instituteImageById.set(institute.id, avatarUrl);
    }
  }

  const courses = listedCourses ?? [];
  const activeFeaturedCourseIds = new Set(
    ((activeFeaturedCourseRows ?? []) as Array<{ course_id: string | null }>)
      .map((item) => item.course_id)
      .filter((item): item is string => typeof item === "string" && item.length > 0),
  );
  const nowMs = Date.now();
  for (const row of (courseFeaturedSummaryRows ?? []) as Array<{ course_id: string | null; starts_at: string; ends_at: string }>) {
    if (!row.course_id) continue;
    const startsAt = new Date(row.starts_at).getTime();
    const endsAt = new Date(row.ends_at).getTime();
    if (startsAt <= nowMs && endsAt > nowMs) activeFeaturedCourseIds.add(row.course_id);
  }
  const rankedCourses = [...courses].sort((left, right) => Number(activeFeaturedCourseIds.has(right.id)) - Number(activeFeaturedCourseIds.has(left.id)));
  const featuredCourses = rankedCourses.filter((course) => activeFeaturedCourseIds.has(course.id)).slice(0, 3);
  const featuredWebinarIdSet = new Set(
    ((featuredWebinarRows ?? []) as Array<{ webinar_id: string | null }>)
      .map((row) => row.webinar_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const { data: webinarFeaturedSummaryRows } = await dataClient.from("webinar_featured_subscription_summary").select("webinar_id,starts_at,ends_at");
  for (const row of (webinarFeaturedSummaryRows ?? []) as Array<{ webinar_id: string | null; starts_at: string; ends_at: string }>) {
    if (!row.webinar_id) continue;
    const startsAt = new Date(row.starts_at).getTime();
    const endsAt = new Date(row.ends_at).getTime();
    if (startsAt <= nowMs && endsAt > nowMs) featuredWebinarIdSet.add(row.webinar_id);
  }
  const rankedWebinars = [...(listedWebinars ?? [])].sort(
    (left, right) => Number(featuredWebinarIdSet.has(right.id)) - Number(featuredWebinarIdSet.has(left.id)),
  );
  const featuredWebinars = rankedWebinars.filter((webinar) => featuredWebinarIdSet.has(webinar.id)).slice(0, 3);
  // The webinar records currently have registration type (free/paid), not a topic category.
  // Use the existing real classification rather than introducing unsupported labels.
  const webinarCategoryGroups = Object.entries(
    rankedWebinars.reduce<Record<string, typeof rankedWebinars>>((acc, webinar) => {
      const category = webinar.webinar_mode === "paid" ? "Paid Webinars" : "Free Webinars";
      acc[category] = [...(acc[category] ?? []), webinar];
      return acc;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  const courseCategoryGroups = Object.entries(
    rankedCourses.reduce<Record<string, typeof rankedCourses>>((acc, course) => {
      const key = course.category || "General";
      acc[key] = [...(acc[key] ?? []), course];
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 4);

  const instituteIds = institutesForHome.map((institute) => institute.id);
  const featuredInstituteRows = instituteIds.length
    ? (
        await dataClient
          .from("active_institute_featured_status")
          .select("institute_id")
          .in("institute_id", instituteIds)
      ).data ?? []
    : [];
  const featuredInstituteIdSet = new Set(
    (featuredInstituteRows as Array<{ institute_id: string | null }>)
      .map((row) => row.institute_id)
      .filter((row): row is string => typeof row === "string" && row.length > 0),
  );
  const featuredInstitutes = institutesForHome.filter((institute) => featuredInstituteIdSet.has(institute.id)).slice(0, 3);
  const instituteCategoryGroups = Object.entries(
    institutesForHome.reduce<Record<string, typeof institutesForHome>>((acc, institute) => {
      const key = getOrganizationTypeLabel(institute.organization_type) || "General";
      acc[key] = [...(acc[key] ?? []), institute];
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:py-14 lg:py-16">
      <section className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-500 p-6 text-white sm:p-8 lg:p-10">
        <Image src="/logo.svg" alt="Vidya Infinity logo" width={360} height={120} className="h-16 w-auto" priority />
        <h1 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-4xl">Global Education Architects</h1>
        <p className="mt-4 max-w-2xl text-white/80">
          Discover verified institutes, apply to approved courses, purchase psychometric tests, and get expert guidance.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/courses" className="rounded-md bg-white px-5 py-2 text-brand-700">
            Explore Courses
          </Link>
          <Link href="/contact" className="rounded-md border border-white px-5 py-2">
            Get Guidance
          </Link>
        </div>
      </section>

      <section className="mt-14 grid gap-8 md:grid-cols-3">
        {[
          { label: "Institute onboarding with admin approval", href: "/auth/register/institute" as Route },
          { label: "Secure Razorpay purchase & enrollment", href: "/courses" as Route },
          { label: "Psychometric test reports and dashboards", href: "/psychometric-tests" as Route },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="rounded-xl border border-slate-200 bg-white p-6 transition hover:border-brand-300">
            <article>
              <h2 className="font-medium">{item.label}</h2>
            </article>
          </Link>
        ))}
      </section>

      {featuredCourses.length > 0 ? (
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Featured Courses</h2>
              <p className="mt-1 text-sm text-slate-600">Handpicked approved courses available now.</p>
            </div>

          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCourses.map((course) => (
              (() => {
                const courseCover = course.course_media?.find((media) => media.type === "image")?.file_url ?? null;
                const courseCoverUrl = courseCover
                  ? /^https?:\/\//i.test(courseCover)
                    ? courseCover
                    : getPublicFileUrl({ bucket: "course-media", path: courseCover })
                  : null;
                return (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}` as Route}
                    className="group flex h-full min-w-0 flex-col rounded-xl border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                  >
                    <article>
                      {courseCoverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                        <Image src={courseCoverUrl} alt={`${course.title} preview`} width={1280} height={720} className="mb-3 aspect-video w-full rounded-md border bg-slate-50 object-contain" />
                      ) : null}
                      <p className="text-xs text-brand-700">{course.category ?? "General"}</p>
                      <h3 className="mt-1 line-clamp-2 text-lg font-semibold">{course.title}</h3>
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">{course.summary ?? "No summary available."}</p>
                      <p className="mt-3 text-xs text-slate-600">
                        {course.duration ?? "-"} · {course.mode ?? "-"} · {course.language ?? "-"}
                      </p>
                      <p className="mt-3 text-base font-semibold">₹{course.fees ?? "-"}</p>
                      <p className="mt-5 text-sm text-brand-600 group-hover:underline">View course</p>
                    </article>
                  </Link>
                );
              })()
            ))}
          </div>
        </section>
      ) : null}

      <section id="courses-by-category" className="mt-12 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Courses by Category</h2>
            <p className="mt-1 text-sm text-slate-600">Choose a category to discover relevant learning opportunities.</p>
          </div>
          <Link href="/courses" className="shrink-0 rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">View all courses →</Link>
        </div>
        <HomeCategoryBrowser
          label="courses"
          emptyMessage="No course categories available yet."
          groups={courseCategoryGroups.map(([category, categoryCourses]) => ({
            name: category,
            cards: categoryCourses.slice(0, 4).map((course) => {
              const cover = course.course_media?.find((media) => media.type === "image")?.file_url ?? null;
              const url = cover
                ? /^https?:\/\//i.test(cover) ? cover : getPublicFileUrl({ bucket: "course-media", path: cover })
                : null;
              return (
                <Link key={course.id} href={`/courses/${course.id}` as Route} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 sm:p-4">
                  {url ? (
                    <Image src={url} alt={`${course.title} banner`} width={1280} height={720} className="aspect-video w-full rounded-lg bg-slate-50 object-contain" />
                  ) : (
                    <div className="grid aspect-video w-full place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">Course banner unavailable</div>
                  )}
                  <div className="mt-3 flex flex-1 flex-col">
                    <h3 className="line-clamp-2 font-semibold text-slate-900">{course.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{course.summary ?? "Explore course details and learning outcomes."}</p>
                    <p className="mt-auto pt-3 text-sm font-semibold text-slate-900">₹{Number(course.fees ?? 0).toLocaleString("en-IN")}</p>
                  </div>
                </Link>
              );
            }),
          }))}
        />
      </section>

      {featuredWebinars.length > 0 ? (
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Featured Webinars</h2>
              <p className="text-sm text-slate-600">Promoted live and upcoming sessions from approved institutes.</p>
            </div>

          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {featuredWebinars.map((webinar) => (
              <Link
                key={webinar.id}
                href={`/webinars/${webinar.id}`}
                className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border bg-white transition hover:border-brand-300 hover:shadow-sm"
              >
                {webinar.thumbnail_url ? <Image src={webinar.thumbnail_url} alt={webinar.title} width={1280} height={720} className="aspect-video w-full bg-slate-50 object-contain" /> : null}
                <div className="p-4">
                  <h3 className="font-semibold">{webinar.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{new Date(webinar.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  <p className="mt-1 text-sm text-slate-600">{webinar.webinar_mode === "paid" ? `₹${Number(webinar.price ?? 0).toLocaleString("en-IN")}` : "Free"}</p>
                  <p className="mt-3 text-sm text-brand-700 group-hover:underline">View webinar</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section id="webinars-by-category" className="mt-12 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Webinars by Category</h2>
            <p className="mt-1 text-sm text-slate-600">Explore upcoming sessions by free or paid registration.</p>
          </div>
          <Link href="/webinars" className="shrink-0 rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">View all webinars →</Link>
        </div>
        <HomeCategoryBrowser
          label="webinars"
          emptyMessage="No public upcoming webinars are available right now."
          groups={webinarCategoryGroups.map(([category, categoryWebinars]) => ({
            name: category,
            cards: categoryWebinars.slice(0, 4).map((webinar) => (
              <Link key={webinar.id} href={`/webinars/${webinar.id}`} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
                {webinar.thumbnail_url ? (
                  <Image src={webinar.thumbnail_url} alt={`${webinar.title} banner`} width={1280} height={720} className="aspect-video w-full bg-slate-50 object-contain" />
                ) : (
                  <div className="grid aspect-video w-full place-items-center bg-slate-100 text-xs text-slate-500">Webinar banner unavailable</div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 font-semibold text-slate-900">{webinar.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{new Date(webinar.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  <p className="mt-auto pt-3 text-sm font-semibold text-slate-900">{webinar.webinar_mode === "paid" ? `₹${Number(webinar.price ?? 0).toLocaleString("en-IN")}` : "Free"}</p>
                </div>
              </Link>
            )),
          }))}
        />
      </section>

      {featuredInstitutes.length > 0 ? (
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Featured Institutes</h2>
              <p className="mt-1 text-sm text-slate-600">Top approved institutes currently open for students.</p>
            </div>

          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredInstitutes.map((institute) => (
              <Link
                key={institute.id}
                href={`/institutes/${institute.slug ?? institute.id}` as Route}
                className="group flex h-full min-w-0 flex-col rounded-xl border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
              >
                <article>
                  {instituteImageById.get(institute.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <Image
                      src={instituteImageById.get(institute.id) ?? ""}
                      alt={`${institute.name ?? "Institute"} cover`}
                      width={1280}
                      height={720}
                      className="mb-3 aspect-video w-full rounded-md border bg-slate-50 object-contain"
                    />
                  ) : null}
                  <p className="text-xs text-brand-700">{institute.organization_type ?? "General"}</p>
                  <h3 className="mt-1 line-clamp-2 text-lg font-semibold">{institute.name ?? "Institute"}</h3>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">{institute.description ?? "No description available."}</p>
                  <p className="mt-3 text-xs text-slate-600">
                    {[institute.address_line_1, institute.city, institute.state, institute.country, institute.postal_code].filter(Boolean).join(", ") ||
                      institute.email ||
                      institute.phone ||
                      "Details not shared yet."}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {institute.website_url ?? institute.phone ?? institute.email ?? (institute.verified ? "Verified institute" : "Profile details available")}
                  </p>
                  <p className="mt-5 text-sm text-brand-600 group-hover:underline">View institute</p>
                </article>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section id="institutes-by-category" className="mt-12 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Institutes by Category</h2>
            <p className="mt-1 text-sm text-slate-600">Find an institution by the kind of education it offers.</p>
          </div>
          <Link href="/institutes" className="shrink-0 rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">View all institutions →</Link>
        </div>
        <HomeCategoryBrowser
          label="institutions"
          emptyMessage="No institutes are available yet."
          groups={instituteCategoryGroups.map(([category, categoryInstitutes]) => ({
            name: category,
            cards: categoryInstitutes.slice(0, 4).map((institute) => {
              const imageUrl = instituteImageById.get(institute.id);
              return (
                <Link key={institute.id} href={`/institutes/${institute.slug ?? institute.id}` as Route} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 sm:p-4">
                  {imageUrl ? (
                    <Image src={imageUrl} alt={`${institute.name ?? "Institute"} banner`} width={1280} height={720} className="aspect-video w-full rounded-lg bg-slate-50 object-contain" />
                  ) : (
                    <div className="grid aspect-video w-full place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">Institute banner unavailable</div>
                  )}
                  <div className="mt-3 flex flex-1 flex-col">
                    <h3 className="line-clamp-2 font-semibold text-slate-900">{institute.name ?? "Institute"}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{institute.description ?? "Explore institution details and available courses."}</p>
                    <p className="mt-auto pt-3 text-xs text-slate-500">
                      {[institute.city, institute.state, institute.country].filter(Boolean).join(", ") || institute.organization_type || "Institute profile"}
                    </p>
                  </div>
                </Link>
              );
            }),
          }))}
        />
      </section>

      <section className="mt-14 rounded-xl border bg-white p-5 sm:p-8">
        <h2 className="text-xl font-semibold">Subscribe to updates</h2>
        <p className="mt-2 text-sm text-slate-600">Newsletter is Mailchimp-ready via server route integration.</p>
        <div className="mt-5 max-w-md">
          <NewsletterForm />
        </div>
      </section>
    </div>
  );
}
