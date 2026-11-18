"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";

export function CourseSyllabusSection({ courseId, text, hasFile }: { courseId: string; text: string | null; hasFile: boolean }) {
  const [expanded, setExpanded] = useState(false);

  async function openPdf(download = false) {
    const res = await fetch(`/api/courses/${courseId}/syllabus-url`);
    const body = (await res.json().catch(() => null)) as { url?: string } | null;
    if (!res.ok || !body?.url) return;
    window.open(download ? `${body.url}&download=syllabus.pdf` : body.url, "_blank", "noopener,noreferrer");
  }

  if (!text && !hasFile) return null;
  const preview = text && text.length > 700 && !expanded ? `${text.slice(0, 700)}…` : text;

  return (
    <div className="space-y-4">
      {text ? (
        <div>
          <p id="course-syllabus-text" className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 sm:text-base">{preview}</p>
          {text.length > 700 ? (
            <button
              type="button"
              aria-controls="course-syllabus-text"
              aria-expanded={expanded}
              className="mt-2 min-h-10 rounded-sm text-sm font-semibold text-brand-700 underline underline-offset-4"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show less" : "Read full syllabus"}
            </button>
          ) : null}
        </div>
      ) : null}
      {hasFile ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openPdf()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">
            <FileText className="size-4" aria-hidden="true" /> View syllabus
          </button>
          <button type="button" onClick={() => openPdf(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <Download className="size-4" aria-hidden="true" /> Download syllabus
          </button>
        </div>
      ) : null}
    </div>
  );
}
