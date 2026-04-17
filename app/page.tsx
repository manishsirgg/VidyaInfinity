import Image from "next/image";
import Link from "next/link";

import { NewsletterForm } from "@/components/shared/newsletter-form";

export default function HomePage() {
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
          <Link href="/services" className="rounded-md border border-white px-5 py-2">
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
