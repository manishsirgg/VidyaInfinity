import Link from "next/link";
import type { ReactNode } from "react";

export function PsychometricAdminHeader({ title, description, breadcrumbs = [], action }: { title: string; description: string; breadcrumbs?: { label: string; href?: string }[]; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-white to-slate-50/60 p-4 shadow-sm md:p-6">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        {breadcrumbs.map((b, i) => (
          <span key={`${b.label}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-slate-300">/</span> : null}
            {b.href ? <Link className="transition hover:text-brand-700 hover:underline" href={b.href}>{b.label}</Link> : <span>{b.label}</span>}
          </span>
        ))}
      </nav>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 md:mt-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 md:text-base">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

const navItems = [
  { label: "Overview", href: "/admin/psychometric" },
  { label: "Tests", href: "/admin/psychometric/tests" },
  { label: "Attempts", href: "/admin/psychometric/attempts" },
  { label: "Reports", href: "/admin/psychometric/reports" },
  { label: "Diagnostics", href: "/admin/psychometric/diagnostics" },
];

export function PsychometricAdminSubnav({ currentPath }: { currentPath: string }) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 rounded-2xl border border-slate-200/70 bg-white p-1.5 shadow-sm">
        {navItems.map((item) => {
          const active = currentPath === item.href;
          return <Link key={item.href} href={item.href} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-brand-600 text-white shadow" : "text-slate-700 hover:bg-slate-100"}`}>{item.label}</Link>;
        })}
      </div>
    </div>
  );
}

export function PsychometricAdminCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:p-5 ${className}`}>{children}</section>;
}

export function PsychometricStatusBadge({ label, tone = "slate" }: { label: string; tone?: "emerald" | "rose" | "amber" | "blue" | "slate" }) {
  const tones = { emerald: "bg-emerald-100 text-emerald-800", rose: "bg-rose-100 text-rose-800", amber: "bg-amber-100 text-amber-800", blue: "bg-blue-100 text-blue-800", slate: "bg-slate-100 text-slate-700" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{label}</span>;
}

export function PsychometricEmptyState({ title, subtitle, cta }: { title: string; subtitle: string; cta?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm"><p className="font-semibold text-slate-900">{title}</p><p className="mt-1 text-sm text-slate-600">{subtitle}</p>{cta ? <div className="mt-4">{cta}</div> : null}</div>;
}
