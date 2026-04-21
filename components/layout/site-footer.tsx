import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/lib/constants/site";

export function SiteFooter() {
  const socialLinks = [
    { href: siteConfig.socialLinks.facebook, label: "Facebook", Icon: Facebook },
    { href: siteConfig.socialLinks.instagram, label: "Instagram", Icon: Instagram },
    { href: siteConfig.socialLinks.linkedin, label: "LinkedIn", Icon: Linkedin },
    { href: siteConfig.socialLinks.youtube, label: "YouTube", Icon: Youtube },
  ] as const;

  return (
    <footer className="mt-16 border-t border-slate-200 bg-white/95">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Image src="/logo.svg" alt={`${siteConfig.name} logo`} width={240} height={60} className="h-10 w-auto sm:h-12" />
          <p className="mt-2 text-sm text-slate-600">{siteConfig.tagline}</p>
          <div className="mt-3 flex items-center gap-2">
            {socialLinks.map(({ href, label, Icon }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:text-brand-700"
              >
                <Icon className="h-4 w-4" />
              </Link>
            ))}
          </div>
        </div>

        <div className="text-sm text-slate-600">
          <p className="break-all sm:break-normal">Email: {siteConfig.email}</p>
          <p>Phone/WhatsApp: {siteConfig.phone}</p>
          <p className="mt-1">{siteConfig.address}</p>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/privacy-policy" className="transition hover:text-brand-700">
            Privacy
          </Link>
          <Link href="/terms-of-service" className="transition hover:text-brand-700">
            Terms
          </Link>
          <Link href="/refund-cancellation-policy" className="transition hover:text-brand-700">
            Refund & Cancellation
          </Link>
          <Link href="/shipping-delivery-policy" className="transition hover:text-brand-700">
            Shipping & Delivery
          </Link>
          <Link href="/cookie-policy" className="transition hover:text-brand-700">
            Cookie Policy
          </Link>
          <Link href="/disclaimer" className="transition hover:text-brand-700">
            Disclaimer
          </Link>
        </div>
      </div>
    </footer>
  );
}
