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
    .limit(6);

  const { data: listedInstitutes } = await dataClient
    .from("institutes")
    .select("id,slug,name,description,organization_type,status")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(6);

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
            <h2 className="text-2xl font-semibold">Listed Courses</h2>
            <p className="mt-1 text-sm text-slate-600">Recently approved courses from verified institutes.</p>
          </div>
          <Link href="/courses" className="text-sm text-brand-600">
            View all courses
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(listedCourses ?? []).map((course) => (
            <article key={course.id} className="rounded-xl border bg-white p-5">
              <h3 className="text-base font-medium">{course.title}</h3>
              <p className="mt-1 text-xs text-slate-500">
                {course.category ?? "General"} · {course.subject ?? "-"} · {course.level ?? "-"}
              </p>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{course.summary ?? "No summary available."}</p>
              <p className="mt-2 text-xs text-slate-600">
                {course.duration ?? "-"} · {course.mode ?? "-"} · {course.language ?? "-"}
              </p>
              <p className="mt-2 text-sm font-medium">₹{course.fees ?? "-"}</p>
              <Link href={`/courses/${course.id}` as Route} className="mt-4 inline-block text-sm text-brand-600">
                View course
              </Link>
            </article>
          ))}
        </div>
        {(listedCourses?.length ?? 0) === 0 ? <p className="mt-4 text-sm text-slate-600">No listed courses available yet.</p> : null}
      </section>

      <section className="mt-14">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Listed Institutes</h2>
            <p className="mt-1 text-sm text-slate-600">Approved institute profiles currently open for students.</p>
          </div>
          <Link href="/institutes" className="text-sm text-brand-600">
            View all institutes
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(listedInstitutes ?? []).map((institute) => (
            <article key={institute.id} className="rounded-xl border bg-white p-5">
              <h3 className="text-base font-medium">{institute.name ?? "Institute"}</h3>
              <p className="mt-1 text-xs text-slate-500">Type: {institute.organization_type ?? "-"}</p>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{institute.description ?? "No description available."}</p>
              <Link href={`/institutes/${institute.slug ?? institute.id}` as Route} className="mt-4 inline-block text-sm text-brand-600">
                View institute
              </Link>
            </article>
          ))}
        </div>
        {(listedInstitutes?.length ?? 0) === 0 ? <p className="mt-4 text-sm text-slate-600">No listed institutes available yet.</p> : null}
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
