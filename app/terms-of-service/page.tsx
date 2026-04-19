import Link from "next/link";

import { siteConfig } from "@/lib/constants/site";

const updatedOn = "April 19, 2026";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 text-slate-700">
      <h1 className="text-3xl font-semibold text-slate-900">Terms of Service</h1>
      <p className="text-sm">Last updated: {updatedOn}</p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern use of the {siteConfig.name} platform at {siteConfig.url}. By accessing
        or using our Platform, you agree to be bound by these Terms, our Privacy Policy, and our other legal policies.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">1) Services and platform role</h2>
        <p>
          {siteConfig.name} provides digital discovery, counselling, lead-generation, and transaction workflows for
          courses, institutes, and assessments. We may act as a marketplace facilitator and technology provider, and
          institute-specific academic outcomes remain the responsibility of the institute or educator.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">2) Eligibility and account responsibilities</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>You must provide accurate details and keep account information updated.</li>
          <li>You are responsible for activity performed through your credentials.</li>
          <li>You must not impersonate others or use the platform for unlawful purposes.</li>
          <li>Institutes must submit only authentic approvals, accreditations, and compliance records.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">3) Listings, pricing, and changes</h2>
        <p>
          Course and institute details are primarily provided by institutes and may change over time. Fees, eligibility,
          schedules, and seat availability are subject to update or withdrawal. We may moderate, reject, suspend, or
          remove listings that violate policy or legal obligations.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">4) Purchases and billing</h2>
        <p>
          Payments are processed by authorized payment partners. By placing an order, you authorize charge processing for
          selected digital services. Tax components, if applicable, may be shown at checkout or invoice stage.
        </p>
        <p>
          Refund eligibility and timelines are governed by our{" "}
          <Link href="/refund-cancellation-policy" className="text-brand-700 underline">
            Refund & Cancellation Policy
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">5) Intellectual property</h2>
        <p>
          Platform code, design, trademarks, and original materials are owned or licensed by {siteConfig.name}. Course
          and institute content belongs to respective content owners. You may not copy, scrape, republish, reverse
          engineer, or commercially exploit content without written authorization.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">6) Prohibited conduct</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Uploading false, defamatory, infringing, or illegal material.</li>
          <li>Attempting unauthorized access, vulnerability scanning, or service disruption.</li>
          <li>Using bots/scrapers that violate platform controls or robots restrictions.</li>
          <li>Manipulating reviews, leads, outcomes, or payment/refund workflows.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">7) Suspension and termination</h2>
        <p>
          We may investigate violations and suspend or terminate access, listings, payouts, or related services where
          misuse, legal risk, or non-compliance is identified.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">8) Disclaimers and limitation of liability</h2>
        <p>
          The Platform is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the maximum extent permitted by law,
          {siteConfig.name} disclaims implied warranties and is not liable for indirect, incidental, special,
          consequential, or punitive damages arising from platform use, institute decisions, third-party services, or
          outcomes beyond our direct control.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">9) Indemnity</h2>
        <p>
          You agree to indemnify and hold harmless {siteConfig.name}, its affiliates, and team members against claims,
          losses, and costs arising from your misuse of the Platform, policy breaches, or infringement of third-party
          rights.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">10) Governing law and contact</h2>
        <p>
          These Terms are governed by applicable Indian law. For legal notices and grievance redressal, contact us at
          {" "}
          <Link href={`mailto:${siteConfig.email}`} className="text-brand-700 underline">
            {siteConfig.email}
          </Link>
          .
        </p>
        <p>Address: {siteConfig.address}</p>
      </section>
    </div>
  );
}
