import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

import { siteConfig } from "@/lib/constants/site";

const links: Array<{ href: Route; label: string }> = [
  { href: "/courses", label: "Courses" },
  { href: "/institutes", label: "Institutes" },
  { href: "/psychometric-tests", label: "Psychometric Tests" },
  { href: "/blogs", label: "Blogs" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center">
          <Image src="/logo.svg" alt={`${siteConfig.name} logo`} width={200} height={40} priority className="h-10 w-auto" />
        </Link>
        <nav className="hidden gap-6 text-sm md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-slate-600 hover:text-brand-600">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 gap-3 text-sm">
          <Link href="/auth/login" className="text-slate-700 hover:text-brand-700">
            Login
          </Link>
          <Link href="/auth/register" className="rounded-md bg-brand-600 px-3 py-1.5 text-white">
            Apply Now
          </Link>
        </div>
      </div>
    </header>
  );
}
