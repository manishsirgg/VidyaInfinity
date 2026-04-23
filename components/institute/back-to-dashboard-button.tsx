"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BackToDashboardButton() {
  const pathname = usePathname();

  if (pathname === "/institute/dashboard") {
    return null;
  }

  return (
    <div className="mx-auto mb-4 max-w-7xl px-4 pt-6">
      <Link
        href="/institute/dashboard"
        className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
      >
        ← Back to dashboard
      </Link>
    </div>
  );
}
