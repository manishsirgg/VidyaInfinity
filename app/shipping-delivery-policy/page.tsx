import { siteConfig } from "@/lib/constants/site";

const updatedOn = "April 19, 2026";

export default function ShippingDeliveryPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 text-slate-700">
      <h1 className="text-3xl font-semibold text-slate-900">Shipping & Delivery Policy</h1>
      <p className="text-sm">Last updated: {updatedOn}</p>

      <p>
        {siteConfig.name} mainly delivers digital services. No physical shipping is required for most orders on this
        platform.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">1) Digital delivery</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Course/test access is delivered to your account dashboard after payment confirmation.</li>
          <li>Activation may be immediate or within a reasonable processing period depending on verification workflows.</li>
          <li>Email confirmations may be sent for orders, receipts, and key status updates.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">2) Delivery timelines</h2>
        <p>
          Typical digital activation occurs within minutes. In rare cases (manual moderation, payment verification,
          provider outages), activation may take up to 48 hours.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">3) No physical shipment</h2>
        <p>
          Unless explicitly stated for a specific offering, we do not ship printed material, merchandise, or physical
          certificates. Any physical dispatch commitment, if introduced, will include dedicated logistics terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold text-slate-900">4) Failed delivery support</h2>
        <p>
          If access is not visible after successful payment, contact support with transaction details at {siteConfig.email}
          for resolution.
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
