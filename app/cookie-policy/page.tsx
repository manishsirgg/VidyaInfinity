import { siteConfig } from "@/lib/constants/site";

const updatedOn = "April 19, 2026";

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 text-slate-700">
      <h1 className="text-3xl font-semibold text-slate-900">Cookie Policy</h1>
      <p className="text-sm">Last updated: {updatedOn}</p>

      <p>
        This Cookie Policy explains how {siteConfig.name} uses cookies and similar technologies on {siteConfig.url}.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">1) What cookies are</h2>
        <p>
          Cookies are small text files stored in your browser that help websites remember your session, preferences, and
          interactions.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">2) Cookie categories we use</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Strictly necessary cookies for sign-in, security, and platform functionality.</li>
          <li>Performance/analytics cookies for understanding usage patterns and improving features.</li>
          <li>Preference cookies for remembering user settings and experience choices.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">3) Third-party technologies</h2>
        <p>
          Some integrations (for payments, messaging, notifications, or analytics) may place their own cookies subject to
          their respective privacy terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">4) Your choices</h2>
        <p>
          You can control cookies through browser settings and device preferences. Disabling necessary cookies may impact
          login, checkout, and dashboard functionality.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">5) Contact</h2>
        <p>Email: {siteConfig.email}</p>
      </section>
    </div>
  );
}
