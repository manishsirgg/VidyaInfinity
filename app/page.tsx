import Link from "next/link";

import { NewsletterForm } from "@/components/shared/newsletter-form";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <section className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-500 p-10 text-white">
        <p className="text-sm uppercase tracking-wider">Vidya Infinity</p>
        <h1 className="mt-3 text-4xl font-semibold">Global Education Architects</h1>
        <p className="mt-4 max-w-2xl text-brand-50">
          Discover verified institutes, apply to approved courses, purchase psychometric tests, and get expert guidance.
        </p>
        <div className="mt-6 flex gap-3">
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

      <section className="mt-14 rounded-xl border bg-white p-8">
        <h2 className="text-xl font-semibold">Subscribe to updates</h2>
        <p className="mt-2 text-sm text-slate-600">Newsletter is Mailchimp-ready via server route integration.</p>
        <div className="mt-5 max-w-md">
          <NewsletterForm />
        </div>
      </section>
    </div>
  );
}
