"use client";

import type { Route } from "next";
import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { siteConfig } from "@/lib/constants/site";

type AuthUser = {
  id: string;
  fullName: string;
  role: "student" | "institute" | "admin";
  avatarUrl: string | null;
  approvalStatus: string;
  email?: string;
  unreadNotifications?: number;
};

type AuthRoutes = {
  dashboard: Route;
  profile: Route;
  notifications?: Route | null;
};

type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  kind: "course" | "institute" | "blog" | "test";
};

const links: Array<{ href: Route; label: string }> = [
  { href: "/courses", label: "Courses" },
  { href: "/institutes", label: "Institutes" },
  { href: "/psychometric-tests", label: "Psychometric Tests" },
  { href: "/blogs", label: "Blogs" },
  { href: "/contact", label: "Contact" },
];

const socialLinks = [
  { href: siteConfig.socialLinks.facebook, label: "Facebook", Icon: Facebook },
  { href: siteConfig.socialLinks.instagram, label: "Instagram", Icon: Instagram },
  { href: siteConfig.socialLinks.linkedin, label: "LinkedIn", Icon: Linkedin },
  { href: siteConfig.socialLinks.youtube, label: "YouTube", Icon: Youtube },
] as const;


function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((value) => value[0]?.toUpperCase() ?? "")
    .join("");
}

export function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authRoutes, setAuthRoutes] = useState<AuthRoutes | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);

  const accountRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  const dashboardPath = useMemo(() => authRoutes?.dashboard ?? ("/auth/login" as Route), [authRoutes]);

  const profilePath = useMemo(() => authRoutes?.profile ?? ("/auth/login" as Route), [authRoutes]);
  const notificationsPath = useMemo(() => authRoutes?.notifications ?? null, [authRoutes]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      setLoadingUser(true);
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const body = await response.json();
      if (cancelled) return;

      if (response.ok && body.authenticated && body.user) {
        setAuthUser(body.user);
        setAuthRoutes((body.routes ?? null) as AuthRoutes | null);
      } else {
        setAuthUser(null);
        setAuthRoutes(null);
      }

      setLoadingUser(false);
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    function onWindowClick(event: MouseEvent) {
      const target = event.target as Node;
      if (accountRef.current && !accountRef.current.contains(target)) {
        setAccountOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
    }

    window.addEventListener("mousedown", onWindowClick);
    return () => window.removeEventListener("mousedown", onWindowClick);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      const response = await fetch(`/api/search/global?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const body = await response.json();
      if (response.ok) {
        setSearchResults(body.items ?? []);
        setSearchOpen(true);
      }
      setSearchLoading(false);
    }, 200);

    return () => clearTimeout(timeout);
  }, [query]);

  async function onLogout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) {
      setAuthUser(null);
      setAccountOpen(false);
      setMenuOpen(false);
      router.push("/");
      router.refresh();
    }
  }

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchResults.length > 0) {
      router.push(searchResults[0].href as Route);
      setSearchOpen(false);
      setMenuOpen(false);
      setQuery("");
    }
  }

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

        <div className="hidden shrink-0 items-center gap-1 md:flex" aria-label="Social links">
          {socialLinks.map(({ href, label, Icon }) => (
            <Link
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="rounded-md p-2 text-slate-600 transition hover:bg-slate-100 hover:text-brand-700"
            >
              <Icon className="h-4 w-4" />
            </Link>
          ))}
        </div>

        <div className="hidden flex-1 justify-end md:flex" ref={searchRef}>
          <div className="relative w-full max-w-sm">
            <form onSubmit={onSearchSubmit}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setSearchOpen(searchResults.length > 0)}
                placeholder="Search courses, institutes, tests, blogs"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                aria-label="Global search"
              />
            </form>
            {searchOpen && (
              <div className="absolute left-0 right-0 top-11 z-50 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                {searchLoading ? (
                  <p className="px-2 py-2 text-xs text-slate-500">Searching...</p>
                ) : searchResults.length > 0 ? (
                  <ul className="max-h-72 overflow-y-auto">
                    {searchResults.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <Link
                          href={item.href as Route}
                          className="block rounded-md px-2 py-2 text-sm hover:bg-slate-100"
                          onClick={() => {
                            setSearchOpen(false);
                            setQuery("");
                          }}
                        >
                          <p className="font-medium text-slate-900">{item.title}</p>
                          <p className="text-xs text-slate-500">{item.subtitle}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 py-2 text-xs text-slate-500">No results found.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-3 text-sm md:flex">
          {!loadingUser && authUser ? (
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-100"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-label="Open account menu"
              >
                {authUser.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={authUser.avatarUrl} alt={authUser.fullName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold text-slate-700">{initials(authUser.fullName)}</span>
                )}
              </button>

              {accountOpen ? (
                <div className="absolute right-0 top-12 z-50 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  <p className="px-2 pb-2 text-xs text-slate-500">{authUser.fullName}</p>
                  <Link
                    href={profilePath}
                    className="block rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setAccountOpen(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    href={dashboardPath}
                    className="block rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setAccountOpen(false)}
                  >
                    Dashboard
                  </Link>
                  {notificationsPath ? (
                    <Link
                      href={notificationsPath}
                      className="flex items-center justify-between rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100"
                      onClick={() => setAccountOpen(false)}
                    >
                      <span>Notifications</span>
                      {(authUser.unreadNotifications ?? 0) > 0 ? (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-700">{authUser.unreadNotifications}</span>
                      ) : null}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="mt-1 w-full rounded-md px-2 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Link href="/auth/login" className="text-slate-700 hover:text-brand-700">
                Login
              </Link>
              <Link href="/auth/register" className="rounded-md bg-brand-600 px-3 py-2 text-white">
                Apply Now
              </Link>
            </>
          )}
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
          <form onSubmit={onSearchSubmit} className="mb-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search everything"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              aria-label="Global search"
            />
          </form>

          {searchOpen && (
            <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-2">
              {searchLoading ? (
                <p className="text-xs text-slate-500">Searching...</p>
              ) : searchResults.length > 0 ? (
                <ul className="space-y-1">
                  {searchResults.map((item) => (
                    <li key={`mobile-${item.kind}-${item.id}`}>
                      <Link
                        href={item.href as Route}
                        onClick={() => {
                          setMenuOpen(false);
                          setSearchOpen(false);
                          setQuery("");
                        }}
                        className="block rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-white"
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">No results found.</p>
              )}
            </div>
          )}

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

          <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3">
            {socialLinks.map(({ href, label, Icon }) => (
              <Link
                key={`mobile-${label}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="rounded-md border border-slate-300 p-2 text-slate-600 transition hover:bg-slate-100 hover:text-brand-700"
              >
                <Icon className="h-4 w-4" />
              </Link>
            ))}
          </div>

          {!loadingUser && authUser ? (
            <div className="mt-3 grid gap-2 text-sm">
              <Link href={profilePath} onClick={() => setMenuOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-slate-700">
                Profile
              </Link>
              <Link href={dashboardPath} onClick={() => setMenuOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-slate-700">
                Dashboard
              </Link>
              {notificationsPath ? (
                <Link href={notificationsPath} onClick={() => setMenuOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-slate-700">
                  Notifications{(authUser.unreadNotifications ?? 0) > 0 ? ` (${authUser.unreadNotifications})` : ""}
                </Link>
              ) : null}
              <button onClick={onLogout} className="rounded-md bg-rose-600 px-3 py-2 text-white" type="button">
                Logout
              </button>
            </div>
          ) : (
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
          )}
        </div>
      ) : null}
    </header>
  );
}
