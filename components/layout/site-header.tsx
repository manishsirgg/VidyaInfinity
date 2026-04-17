"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { siteConfig } from "@/lib/constants/site";

const links: Array<{ href: Route; label: string }> = [
  { href: "/courses", label: "Courses" },
  { href: "/institutes", label: "Institutes" },
  { href: "/psychometric-tests", label: "Psychometric Tests" },
  { href: "/blogs", label: "Blogs" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2">
        <Link href="/" className="flex items-center" onClick={() => setMenuOpen(false)}>
          <Image
            src="/logo.svg"
            alt={`${siteConfig.name} logo`}
            width={200}
            height={40}
            priority
            className="h-9 w-auto sm:h-10"
          />
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-slate-600 transition hover:text-brand-600">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 text-sm md:flex">
          <Link href="/auth/login" className="text-slate-700 hover:text-brand-700">
            Login
          </Link>
          <Link href="/auth/register" className="rounded-md bg-brand-600 px-3 py-2 text-white">
            Apply Now
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 md:hidden"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      {menuOpen ? (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <nav className="grid gap-1 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-2 py-2 text-slate-700 hover:bg-slate-100"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Link
              href="/auth/login"
              onClick={() => setMenuOpen(false)}
              className="rounded-md border border-slate-300 px-3 py-2 text-center text-slate-700"
            >
              Login
            </Link>
            <Link
              href="/auth/register"
              onClick={() => setMenuOpen(false)}
              className="rounded-md bg-brand-600 px-3 py-2 text-center text-white"
            >
              Apply Now
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
