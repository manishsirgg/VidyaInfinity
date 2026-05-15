"use client";
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
  const preview = text && text.length > 700 && !expanded ? `${text.slice(0, 700)}...` : text;
  return <section><h2 className="text-lg font-semibold">Course Syllabus</h2>{text ? <div className="mt-2 rounded border bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-700">{preview}{text.length>700?<button type="button" className="ml-2 text-brand-700 underline" onClick={()=>setExpanded((v)=>!v)}>{expanded?"Show less":"Read full syllabus"}</button>:null}</div>:null}{hasFile?<div className="mt-3 flex gap-2"><button type="button" onClick={()=>openPdf(false)} className="rounded bg-brand-700 px-3 py-1.5 text-sm text-white">View Syllabus</button><button type="button" onClick={()=>openPdf(true)} className="rounded border px-3 py-1.5 text-sm">Download Syllabus</button></div>:null}</section>;
}
