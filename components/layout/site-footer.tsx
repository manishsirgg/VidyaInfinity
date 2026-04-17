import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/lib/constants/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Image src="/logo.svg" alt={`${siteConfig.name} logo`} width={240} height={60} className="h-10 w-auto sm:h-12" />
          <p className="mt-2 text-sm text-slate-600">{siteConfig.tagline}</p>
        </div>

        <div className="text-sm text-slate-600">
          <p className="break-all sm:break-normal">Email: {siteConfig.email}</p>
          <p>Phone/WhatsApp: {siteConfig.phone}</p>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/privacy-policy" className="hover:text-brand-700">
            Privacy
          </Link>
          <Link href="/terms-of-service" className="hover:text-brand-700">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
