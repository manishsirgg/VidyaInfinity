import Link from "next/link";

import { siteConfig } from "@/lib/constants/site";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <h3 className="font-semibold text-brand-700">{siteConfig.name}</h3>
          <p className="mt-2 text-sm text-slate-600">{siteConfig.tagline}</p>
        </div>
        <div className="text-sm text-slate-600">
          <p>Email: {siteConfig.email}</p>
          <p>Phone/WhatsApp: {siteConfig.phone}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href="/privacy-policy">Privacy</Link>
          <Link href="/terms-of-service">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
