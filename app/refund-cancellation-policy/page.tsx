import { siteConfig } from "@/lib/constants/site";

const updatedOn = "April 19, 2026";

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 text-slate-700">
      <h1 className="text-3xl font-semibold text-slate-900">Refund & Cancellation Policy</h1>
      <p className="text-sm">Last updated: {updatedOn}</p>

      <p>
        This policy explains cancellation and refund rules for digital products and services purchased on {siteConfig.name}.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">1) Scope</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Course purchase transactions processed via our platform.</li>
          <li>Psychometric tests and related digital reports.</li>
          <li>Paid counselling/advisory slots (if listed as paid services).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">2) General refund rule</h2>
        <p>
          Since our services are primarily digital and may grant immediate access, refunds are generally restricted after
          material consumption, report generation, or course/content access.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">3) Eligible refund scenarios</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Duplicate payment for the same order due to technical error.</li>
          <li>Payment captured but service not delivered due to a verified platform failure.</li>
          <li>Order charged after user-initiated cancellation within a clearly published eligible window.</li>
          <li>Any refund mandated by applicable law, regulator, or final dispute resolution outcome.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">4) Non-refundable scenarios</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Change of mind after access has been granted.</li>
          <li>Course/test completion dissatisfaction not caused by objective service failure.</li>
          <li>Incorrect purchase by the user (wrong course/goal/package) where content access already began.</li>
          <li>Failure to meet institute eligibility requirements disclosed before purchase.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">5) Request process and timeline</h2>
        <p>
          Submit refund requests from your account area (where available) or via {siteConfig.email} with order ID,
          transaction reference, and issue details. Requests are typically reviewed within 7 business days.
        </p>
        <p>Approved refunds are processed to the original payment source, usually within 7-14 business days.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">6) Cancellations</h2>
        <p>
          If a service supports cancellation before activation, cancellation must be submitted before first access or
          processing event. After activation/access, cancellation may stop future renewals but may not trigger a refund
          for the current cycle unless legally required.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">7) Chargebacks and abuse prevention</h2>
        <p>
          Users are encouraged to contact support before raising chargebacks. Abuse of refund systems, fraudulent claims,
          or policy manipulation may lead to account restrictions.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">8) Contact</h2>
        <p>Email: {siteConfig.email}</p>
        <p>Address: {siteConfig.address}</p>
      </section>
    </div>
  );
}
