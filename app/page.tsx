import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";

import { NewsletterForm } from "@/components/shared/newsletter-form";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const admin = getSupabaseAdmin();
  const dataClient = admin.ok ? admin.data : supabase;

  const { data: listedCourses } = await dataClient
    .from("courses")
    .select("id,title,summary,fees,category,subject,level,language,duration,mode,status")
    .eq("status", "approved")
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: false })
    .limit(18);

  const statusAwareInstitutes = await dataClient
    .from("institutes")
    .select("id,slug,name,description,organization_type,status")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(18);
  const approvalAwareInstitutes = statusAwareInstitutes.error
    ? await dataClient
        .from("institutes")
        .select("id,slug,name,description,organization_type,approval_status")
        .eq("approval_status", "approved")
        .order("created_at", { ascending: false })
        .limit(18)
    : statusAwareInstitutes;
  const listedInstitutes = (approvalAwareInstitutes.data ?? []) as {
    id: string;
    slug: string | null;
    name: string | null;
    description: string | null;
    organization_type: string | null;
  }[];

  const courses = listedCourses ?? [];
  const featuredCourses = courses.slice(0, 3);
  const courseCategoryGroups = Object.entries(
    courses.reduce<Record<string, typeof courses>>((acc, course) => {
      const key = course.category || "General";
      acc[key] = [...(acc[key] ?? []), course];
      return acc;
    }, {}),
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 4);

  const featuredInstitutes = listedInstitutes.slice(0, 3);
  const instituteCategoryGroups = Object.entries(
    listedInstitutes.reduce<Record<string, typeof listedInstitutes>>((acc, institute) => {
      const key = institute.organization_type || "General";
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
        <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Global Education Architects</h1>
        <p className="mt-4 max-w-2xl text-brand-50">
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
          "Institute onboarding with admin approval",
          "Secure Razorpay purchase & enrollment",
          "Psychometric test reports and dashboards",
        ].map((value) => (
          <article key={value} className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-medium">{value}</h2>
          </article>
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
            <Link
              key={course.id}
              href={`/courses/${course.id}` as Route}
              className="group rounded-xl border bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
            >
              <article className="aspect-square">
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
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}` as Route}
                    className="group rounded-xl border bg-white p-4 transition hover:border-brand-300 hover:shadow-sm"
                  >
                    <article className="aspect-square">
                      <h4 className="line-clamp-2 text-base font-medium">{course.title}</h4>
                      <p className="mt-2 line-clamp-4 text-sm text-slate-600">{course.summary ?? "No summary available."}</p>
                      <p className="mt-3 text-xs text-slate-500">{course.subject ?? "-"} · {course.level ?? "-"}</p>
                      <p className="mt-4 text-sm font-semibold">₹{course.fees ?? "-"}</p>
                    </article>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        {courseCategoryGroups.length === 0 ? <p className="mt-4 text-sm text-slate-600">No course categories available yet.</p> : null}
      </section>

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
              <article className="aspect-square">
                <p className="text-xs text-brand-700">{institute.organization_type ?? "General"}</p>
                <h3 className="mt-1 line-clamp-2 text-lg font-semibold">{institute.name ?? "Institute"}</h3>
                <p className="mt-2 line-clamp-5 text-sm text-slate-600">{institute.description ?? "No description available."}</p>
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
                    <article className="aspect-square">
                      <h4 className="line-clamp-2 text-base font-medium">{institute.name ?? "Institute"}</h4>
                      <p className="mt-2 line-clamp-5 text-sm text-slate-600">{institute.description ?? "No description available."}</p>
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
