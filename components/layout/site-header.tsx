"use client";

import type { Route } from "next";
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
  kind: "course" | "institute" | "blog" | "test" | "webinar";
};

const links: Array<{ href: Route; label: string }> = [
  { href: "/courses", label: "Courses" },
  { href: "/webinars", label: "Webinars" },
  { href: "/institutes", label: "Institutes" },
  { href: "/psychometric-tests", label: "Psychometric Tests" },
];

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
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
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
            <Link key={link.href} href={link.href} className="rounded-md px-1 py-1 text-slate-600 transition hover:text-brand-600">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden flex-1 justify-end md:flex" ref={searchRef}>
          <div className="relative w-full max-w-sm">
            <form onSubmit={onSearchSubmit}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setSearchOpen(searchResults.length > 0)}
                placeholder="Search courses, webinars, institutes, tests, blogs"
                className="vi-input py-2 text-sm"
                aria-label="Global search"
              />
            </form>
            {searchOpen && (
              <div className="absolute left-0 right-0 top-11 z-50 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                {searchLoading ? (
                  <p className="px-2 py-2 text-xs text-slate-500">Searching...</p>
                ) : searchResults.length > 0 ? (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        router.push(item.href as Route);
                        setSearchOpen(false);
                        setMenuOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full flex-col rounded-lg px-2 py-2 text-left transition hover:bg-slate-100"
                    >
                      <span className="text-sm font-medium text-slate-800">{item.title}</span>
                      <span className="text-xs text-slate-500">{item.subtitle}</span>
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-2 text-xs text-slate-500">No results found.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2" ref={accountRef}>
          {!loadingUser && authUser ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((current) => !current)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                {initials(authUser.fullName)}
              </button>
              {accountOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-xl">
                  <p className="px-2 py-1.5 text-xs text-slate-500">Signed in as</p>
                  <p className="truncate px-2 pb-2 text-sm font-medium text-slate-700">{authUser.fullName}</p>
                  <Link
                    href={dashboardPath}
                    onClick={() => {
                      setAccountOpen(false);
                      setMenuOpen(false);
                    }}
                    className="block rounded-lg px-2 py-2 text-slate-700 transition hover:bg-slate-100"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href={profilePath}
                    onClick={() => {
                      setAccountOpen(false);
                      setMenuOpen(false);
                    }}
                    className="block rounded-lg px-2 py-2 text-slate-700 transition hover:bg-slate-100"
                  >
                    Profile
                  </Link>
                  {notificationsPath ? (
                    <Link
                      href={notificationsPath}
                      onClick={() => {
                        setAccountOpen(false);
                        setMenuOpen(false);
                      }}
                      className="flex items-center justify-between rounded-lg px-2 py-2 text-slate-700 transition hover:bg-slate-100"
                    >
                      <span>Notifications</span>
                      {typeof authUser.unreadNotifications === "number" && authUser.unreadNotifications > 0 ? (
                        <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold text-white">{authUser.unreadNotifications}</span>
                      ) : null}
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={onLogout}
                    className="mt-1 w-full rounded-lg px-2 py-2 text-left text-rose-600 transition hover:bg-rose-50"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/auth/login" className="rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100">
                Log in
              </Link>
              <Link href="/auth/register" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700">
                Register
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 md:hidden"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            Menu
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <nav className="grid gap-2 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-slate-700 transition hover:bg-slate-100"
              >
                {link.label}
              </Link>
            ))}
            {!authUser ? (
              <>
                <Link href="/auth/login" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 text-slate-700 transition hover:bg-slate-100">
                  Log in
                </Link>
                <Link href="/auth/register" onClick={() => setMenuOpen(false)} className="rounded-lg bg-brand-600 px-3 py-2 text-center font-medium text-white transition hover:bg-brand-700">
                  Register
                </Link>
              </>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
