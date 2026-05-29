"use client";

import { Building2, GraduationCap, Sparkles } from "lucide-react";
import { useId, useState } from "react";

const audiences = [
  {
    id: "students",
    label: "For Students",
    title: "Find the Right Direction",
    text: "Explore learning opportunities, discover trusted institutes, attend webinars, and make better education decisions with more clarity.",
    points: [
      "Career-focused discovery",
      "Trusted institute options",
      "Webinars and learning opportunities",
    ],
    Icon: GraduationCap,
  },
  {
    id: "institutes",
    label: "For Institutes",
    title: "Reach the Right Learners",
    text: "Showcase your courses, receive genuine inquiries, track every lead, and grow your institution’s digital presence through a focused education platform.",
    points: [
      "Professional visibility",
      "Genuine student inquiries",
      "CRM-backed lead tracking",
    ],
    Icon: Building2,
  },
] as const;

export function AboutAudienceTabs() {
  const [activeAudience, setActiveAudience] =
    useState<(typeof audiences)[number]["id"]>("students");
  const baseId = useId();
  const active =
    audiences.find((audience) => audience.id === activeAudience) ??
    audiences[0];
  const ActiveIcon = active.Icon;

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white/80 p-3 shadow-xl shadow-brand-900/5 backdrop-blur">
      <div
        className="grid gap-2 rounded-[1.5rem] bg-slate-100/80 p-1 sm:grid-cols-2"
        role="tablist"
        aria-label="Vidya Infinity audiences"
      >
        {audiences.map((audience) => (
          <button
            key={audience.id}
            id={`${baseId}-${audience.id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeAudience === audience.id}
            aria-controls={`${baseId}-${audience.id}-panel`}
            onClick={() => setActiveAudience(audience.id)}
            className={`rounded-[1.2rem] px-5 py-3 text-sm font-semibold transition duration-200 ${
              activeAudience === audience.id
                ? "bg-white text-brand-700 shadow-sm ring-1 ring-brand-100"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
            }`}
          >
            {audience.label}
          </button>
        ))}
      </div>

      <div
        id={`${baseId}-${active.id}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-${active.id}-tab`}
        className="mt-3 overflow-hidden rounded-[1.5rem] border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-amber-50 p-6 sm:p-8"
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              <Sparkles className="h-3.5 w-3.5" /> Interactive guidance
            </div>
            <h3 className="mt-4 text-2xl font-bold text-slate-950 sm:text-3xl">
              {active.title}
            </h3>
            <p className="mt-3 text-base text-slate-600 sm:text-lg">
              {active.text}
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {active.points.map((point) => (
                <div
                  key={point}
                  className="rounded-2xl border border-white/80 bg-white/80 p-4 text-sm font-medium text-slate-700 shadow-sm"
                >
                  {point}
                </div>
              ))}
            </div>
          </div>
          <div className="grid h-36 w-full place-items-center rounded-[1.5rem] border border-white/80 bg-white/70 text-brand-700 shadow-inner sm:h-44 lg:w-56">
            <ActiveIcon className="h-16 w-16" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
