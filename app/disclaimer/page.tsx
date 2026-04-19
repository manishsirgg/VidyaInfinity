import { siteConfig } from "@/lib/constants/site";

const updatedOn = "April 19, 2026";

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 text-slate-700">
      <h1 className="text-3xl font-semibold text-slate-900">Disclaimer</h1>
      <p className="text-sm">Last updated: {updatedOn}</p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">1) Informational nature of listings</h2>
        <p>
          Institute and course information is published from partner submissions and available records. While we moderate
          and verify where possible, we do not guarantee uninterrupted accuracy, completeness, or suitability of every
          listing at all times.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">2) No guaranteed outcomes</h2>
        <p>
          Admissions, scholarship decisions, visa approvals, placements, and career outcomes depend on third-party
          institutions and personal factors, and cannot be guaranteed by {siteConfig.name}.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">3) Psychometric and counselling outputs</h2>
        <p>
          Psychometric reports and counselling guidance are educational tools and should not be treated as medical,
          psychiatric, legal, immigration, or financial advice.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">4) External links and third-party services</h2>
        <p>
          The Platform may include links to external sites. We are not responsible for third-party content, availability,
          policy updates, or security practices.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">5) Contact</h2>
        <p>Email: {siteConfig.email}</p>
        <p>Address: {siteConfig.address}</p>
      </section>
    </div>
  );
}
