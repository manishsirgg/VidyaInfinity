import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";

import { NewsletterForm } from "@/components/shared/newsletter-form";
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
  const homeWebinars = rankedWebinars.slice(0, 3);
  const courseCategoryGroups = Object.entries(
    rankedCourses.reduce<Record<string, typeof rankedCourses>>((acc, course) => {
      const key = course.category || "General";
      acc[key] = [...(acc[key] ?? []), course];
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 4);

  const featuredInstitutes = institutesForHome.slice(0, 3);
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

      <section className="mt-14">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Featured Courses</h2>
            <p className="mt-1 text-sm text-slate-600">Handpicked approved courses available now.</p>
          </div>
          <Link href="/courses" className="text-sm text-brand-600">
            View all courses
          </Link>
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
                  className="group rounded-xl border bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
                >
                  <article>
                    {courseCoverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                      <img src={courseCoverUrl} alt={`${course.title} preview`} className="mb-3 h-40 w-full rounded-md border object-cover" />
                    ) : null}
                    <p className="text-xs text-brand-700">{course.category ?? "General"}</p>
                    <h3 className="mt-1 line-clamp-2 text-lg font-semibold">{course.title}</h3>
                    <p className="mt-2 line-clamp-4 text-sm text-slate-600">{course.summary ?? "No summary available."}</p>
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
        {featuredCourses.length === 0 ? <p className="mt-4 text-sm text-slate-600">No listed courses available yet.</p> : null}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Courses by Category</h2>
            <p className="mt-1 text-sm text-slate-600">Browse courses grouped by category.</p>
          </div>
        </div>
        <div className="mt-6 space-y-8">
          {courseCategoryGroups.map(([category, categoryCourses]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{category}</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {categoryCourses.slice(0, 4).map((course) => (
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
                        className="group rounded-xl border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                      >
                        <article>
                          {courseCoverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                            <img src={courseCoverUrl} alt={`${course.title} preview`} className="mb-3 h-32 w-full rounded-md border object-cover" />
                          ) : null}
                          <h4 className="line-clamp-2 text-base font-medium">{course.title}</h4>
                          <p className="mt-2 line-clamp-4 text-sm text-slate-600">{course.summary ?? "No summary available."}</p>
                          <p className="mt-3 text-xs text-slate-500">{course.subject ?? "-"} · {course.level ?? "-"}</p>
                          <p className="mt-4 text-sm font-semibold">₹{course.fees ?? "-"}</p>
                        </article>
                      </Link>
                    );
                  })()
                ))}
              </div>
            </div>
          ))}
        </div>
        {courseCategoryGroups.length === 0 ? <p className="mt-4 text-sm text-slate-600">No course categories available yet.</p> : null}
      </section>

      {featuredWebinars.length > 0 ? (
        <section className="mt-14">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Featured Webinars</h2>
              <p className="text-sm text-slate-600">Promoted live and upcoming sessions from approved institutes.</p>
            </div>
            <Link href="/webinars" className="text-sm text-brand-700">
              Browse webinars
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {featuredWebinars.map((webinar) => (
              <Link
                key={webinar.id}
                href={`/webinars/${webinar.id}`}
                className="group overflow-hidden rounded-xl border bg-white transition hover:border-brand-300 hover:shadow-sm"
              >
                {webinar.thumbnail_url ? <img src={webinar.thumbnail_url} alt={webinar.title} className="h-40 w-full object-cover" /> : null}
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

      {homeWebinars.length > 0 ? (
        <section className="mt-14">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold">Upcoming Webinars</h2>
              <p className="text-sm text-slate-600">Scheduled and live sessions from approved institutes.</p>
            </div>
            <Link href="/webinars" className="text-sm text-brand-700">
              Browse webinars
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {homeWebinars.map((webinar) => (
              <Link
                key={webinar.id}
                href={`/webinars/${webinar.id}`}
                className="group overflow-hidden rounded-xl border bg-white transition hover:border-brand-300 hover:shadow-sm"
              >
                {webinar.thumbnail_url ? <img src={webinar.thumbnail_url} alt={webinar.title} className="h-40 w-full object-cover" /> : null}
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{webinar.title}</h3>
                    {featuredWebinarIdSet.has(webinar.id) ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Featured</span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{new Date(webinar.starts_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  <p className="mt-1 text-sm text-slate-600">{webinar.webinar_mode === "paid" ? `₹${Number(webinar.price ?? 0).toLocaleString("en-IN")}` : "Free"}</p>
                  <p className="mt-3 text-sm text-brand-700 group-hover:underline">View webinar</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-14">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Featured Institutes</h2>
            <p className="mt-1 text-sm text-slate-600">Top approved institutes currently open for students.</p>
          </div>
          <Link href="/institutes" className="text-sm text-brand-600">
            View all institutes
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredInstitutes.map((institute) => (
            <Link
              key={institute.id}
              href={`/institutes/${institute.slug ?? institute.id}` as Route}
              className="group rounded-xl border bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
            >
              <article>
                {instituteImageById.get(institute.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={instituteImageById.get(institute.id) ?? ""}
                    alt={`${institute.name ?? "Institute"} cover`}
                    className="mb-3 h-40 w-full rounded-md border object-cover"
                  />
                ) : null}
                <p className="text-xs text-brand-700">{institute.organization_type ?? "General"}</p>
                <h3 className="mt-1 line-clamp-2 text-lg font-semibold">{institute.name ?? "Institute"}</h3>
                <p className="mt-2 line-clamp-5 text-sm text-slate-600">{institute.description ?? "No description available."}</p>
                <p className="mt-3 text-xs text-slate-600">
                  {[institute.address_line_1, institute.city, institute.state, institute.country, institute.postal_code].filter(Boolean).join(", ") ||
                    institute.email ||
                    institute.phone ||
                    "Details not shared yet."}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {institute.website_url ?? institute.phone ?? institute.email ?? (institute.verified ? "Verified institute" : "Profile details available")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {institute.website_url ?? institute.phone ?? institute.email ?? (institute.verified ? "Verified institute" : "Profile details available")}
                </p>
                <p className="mt-5 text-sm text-brand-600 group-hover:underline">View institute</p>
              </article>
            </Link>
          ))}
        </div>
        {featuredInstitutes.length === 0 ? <p className="mt-4 text-sm text-slate-600">No listed institutes available yet.</p> : null}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Institutes by Category</h2>
            <p className="mt-1 text-sm text-slate-600">Explore institutes grouped by organization type.</p>
          </div>
        </div>
        <div className="mt-6 space-y-8">
          {instituteCategoryGroups.map(([category, institutes]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{category}</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {institutes.slice(0, 4).map((institute) => (
                  <Link
                    key={institute.id}
                  href={`/institutes/${institute.slug ?? institute.id}` as Route}
                  className="group rounded-xl border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                >
                    <article>
                      {instituteImageById.get(institute.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={instituteImageById.get(institute.id) ?? ""}
                          alt={`${institute.name ?? "Institute"} cover`}
                          className="mb-3 h-32 w-full rounded-md border object-cover"
                        />
                      ) : null}
                      <h4 className="line-clamp-2 text-base font-medium">{institute.name ?? "Institute"}</h4>
                      <p className="mt-2 line-clamp-5 text-sm text-slate-600">{institute.description ?? "No description available."}</p>
                      <p className="mt-3 text-xs text-slate-600">
                        {[institute.address_line_1, institute.city, institute.state, institute.country, institute.postal_code].filter(Boolean).join(", ") ||
                          institute.email ||
                          institute.phone ||
                          "Details not shared yet."}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {institute.website_url ?? institute.phone ?? institute.email ?? (institute.verified ? "Verified institute" : "Profile details available")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {institute.website_url ?? institute.phone ?? institute.email ?? (institute.verified ? "Verified institute" : "Profile details available")}
                      </p>
                      <p className="mt-4 text-xs text-brand-700">View details</p>
                    </article>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        {instituteCategoryGroups.length === 0 ? <p className="mt-4 text-sm text-slate-600">No institute categories available yet.</p> : null}
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
