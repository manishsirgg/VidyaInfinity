import Link from "next/link";

import { ServiceInquiryForm } from "@/components/forms/service-inquiry-form";
import { siteConfig } from "@/lib/constants/site";

export default function ContactPage() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 md:grid-cols-[1.2fr,1fr]">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold">Contact & Guidance</h1>
        <p className="text-slate-600">
          Share your requirement and our counsellors will support you with personalised guidance for admissions,
          career planning, visa assistance, and more.
        </p>

        <div className="rounded-xl border bg-white p-5 text-sm leading-6 text-slate-700">
          <p className="text-base font-semibold text-slate-900">Vidya Infinity</p>
          <p>
            Website:{" "}
            <Link href="https://vidyainfinity.com" className="font-medium text-brand-700 hover:underline">
              https://vidyainfinity.com
            </Link>
          </p>
          <p>
            Email:{" "}
            <Link href={`mailto:${siteConfig.email}`} className="font-medium text-brand-700 hover:underline">
              {siteConfig.email}
            </Link>
          </p>
          <p>
            WhatsApp / Call:{" "}
            <Link href="tel:+917828199500" className="font-medium text-brand-700 hover:underline">
              {siteConfig.phone}
            </Link>
          </p>
          <p>Subsidiary: Infinity Global Advisory</p>
          <p>Address: {siteConfig.address}</p>
        </div>
      </section>

      <ServiceInquiryForm />
    </div>
  );
}
