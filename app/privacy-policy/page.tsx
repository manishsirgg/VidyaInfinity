import { siteConfig } from "@/lib/constants/site";

const updatedOn = "April 19, 2026";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 text-slate-700">
      <h1 className="text-3xl font-semibold text-slate-900">Privacy Policy</h1>
      <p className="text-sm">Last updated: {updatedOn}</p>
      <p>
        This Privacy Policy explains how {siteConfig.name} (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) collects, uses, stores, shares, and protects
        personal data when you use {siteConfig.url}, our web pages, forms, dashboards, and related services (collectively,
        the &quot;Platform&quot;).
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">1) Who we are</h2>
        <p>
          {siteConfig.name} is an education marketplace and advisory platform that helps students discover institutes,
          compare courses, submit leads, buy digital learning products (including psychometric tests), and connect with
          education counsellors.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">2) Information we collect</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Identity data: name, profile details, role (student/institute/admin), organization details.</li>
          <li>Contact data: email, phone, WhatsApp number, city/state/country, and address details where provided.</li>
          <li>Account and authentication data: login credentials, password reset metadata, session/device identifiers.</li>
          <li>Course activity data: viewed/saved courses, purchase history, and enrollment records.</li>
          <li>Financial/payment data: transaction references from payment providers (we do not store full card data).</li>
          <li>Uploaded content: media files, profile images, KYC/compliance documents, blog media, and support requests.</li>
          <li>Assessment data: psychometric test attempts, responses, scores, and generated reports.</li>
          <li>Technical usage data: browser information, logs, IP/device patterns, cookie and analytics signals.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">3) Why we process data</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>To create and secure user accounts.</li>
          <li>To publish and moderate institute/course listings.</li>
          <li>To process payments, refunds, disputes, and related records.</li>
          <li>To provide psychometric testing and downloadable/report outputs.</li>
          <li>To respond to support, contact, and service inquiry requests.</li>
          <li>To send transactional messages and optional marketing updates (subject to your preferences).</li>
          <li>To prevent fraud, abuse, unauthorized access, and policy violations.</li>
          <li>To comply with legal obligations, audits, and law-enforcement requests.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">4) Sharing and disclosures</h2>
        <p>We may share relevant data with:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Institute partners where students submit lead/enquiry forms for their programs.</li>
          <li>Payment, cloud hosting, storage, communication, and analytics vendors acting as service providers.</li>
          <li>Regulators, authorities, or courts where disclosure is legally required.</li>
          <li>Corporate successors in case of merger, acquisition, restructuring, or asset transfer.</li>
        </ul>
        <p>We do not sell personal data for third-party advertising profiles.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">5) Cookies and tracking</h2>
        <p>
          We use essential cookies for login/session continuity and security. We may use additional cookies or similar
          technologies for analytics and product improvements. See our Cookie Policy for category-level details.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">6) Data retention</h2>
        <p>
          We retain data only for as long as required for service delivery, compliance, fraud prevention, and dispute
          resolution. Different categories may have different retention periods, and backups may continue for limited
          periods under our infrastructure controls.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">7) Security controls</h2>
        <p>
          We use commercially reasonable safeguards such as role-based access controls, audit logging, managed cloud
          infrastructure, and encrypted transport. No online system is completely risk-free; users should also protect
          their credentials and devices.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">8) Your rights and choices</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Access, update, or correct account/profile information.</li>
          <li>Request deletion of account data, subject to legal and contractual retention obligations.</li>
          <li>Withdraw consent for optional communications (unsubscribe links/preferences may apply).</li>
          <li>Request details about how your data is processed and shared.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">9) Children</h2>
        <p>
          Our services are intended for users who can legally enter into binding contracts or are using the service with
          guardian consent and supervision where applicable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">10) Contact for privacy requests</h2>
        <p>Email: {siteConfig.email}</p>
        <p>Address: {siteConfig.address}</p>
      </section>
    </div>
  );
}
