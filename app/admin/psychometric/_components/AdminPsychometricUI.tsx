import Link from "next/link";
import type { ReactNode } from "react";

export function PsychometricAdminHeader({ title, description, breadcrumbs = [], action }: { title: string; description: string; breadcrumbs?: { label: string; href?: string }[]; action?: ReactNode }) {
  return (
    <div className="space-y-3">
      <nav className="text-xs text-slate-500">
        {breadcrumbs.map((b, i) => (
          <span key={`${b.label}-${i}`}>
            {i > 0 ? " / " : ""}
            {b.href ? <Link className="underline" href={b.href}>{b.label}</Link> : <span>{b.label}</span>}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold md:text-3xl">{title}</h1><p className="text-sm text-slate-600">{description}</p></div>
        {action}
      </div>
    </div>
  );
}

export function PsychometricAdminCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border bg-white p-4 ${className}`}>{children}</section>;
}

export function PsychometricStatusBadge({ label, tone = "slate" }: { label: string; tone?: "emerald" | "rose" | "amber" | "blue" | "slate" }) {
  const tones = { emerald: "bg-emerald-100 text-emerald-800", rose: "bg-rose-100 text-rose-800", amber: "bg-amber-100 text-amber-800", blue: "bg-blue-100 text-blue-800", slate: "bg-slate-100 text-slate-700" };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{label}</span>;
}

export function PsychometricEmptyState({ title, subtitle, cta }: { title: string; subtitle: string; cta?: ReactNode }) {
  return <div className="rounded-xl border border-dashed bg-white p-8 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-slate-600">{subtitle}</p>{cta ? <div className="mt-3">{cta}</div> : null}</div>;
}
