"use client";
import { useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";

export function InstituteUpdatesClient({ initialUpdates }: { initialUpdates: Array<Record<string, unknown>> }) {
  const [content, setContent] = useState(""); const [image, setImage] = useState<File | null>(null); const [video, setVideo] = useState<File | null>(null); const [updates, setUpdates] = useState(initialUpdates);
  async function submit() {
    const fd = new FormData(); fd.append("content", content); if (image) fd.append("image", image); if (video) fd.append("video", video);
    const res = await fetch("/api/institute/updates", { method: "POST", body: fd }); if (!res.ok) { alert((await res.json()).error ?? "Failed"); return; } location.reload();
  }
  return <div className="space-y-4">
    <div className="vi-card p-4"><textarea className="vi-input min-h-24 w-full" value={content} onChange={(e)=>setContent(e.target.value.slice(0,280))} placeholder="Share a short update..." /><p className="text-xs text-slate-500">{content.length}/280 · You can upload either one image or one short video.</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>{setImage(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setVideo(null);}} /><input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e)=>{setVideo(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setImage(null);}} /></div><button onClick={submit} className="vi-button-primary mt-3">Submit for Review</button></div>
    <div className="space-y-3">{updates.map((u)=> <div key={String(u.id)} className="vi-card p-4"><div className="flex justify-between"><StatusBadge status={String(u.status ?? "draft")} /><span className="text-xs text-slate-500">{new Date(String(u.created_at)).toLocaleString()}</span></div><p className="mt-2 text-sm">{String(u.content ?? "")}</p>{u.rejection_reason ? <p className="mt-2 text-xs text-rose-600">Rejection reason: {String(u.rejection_reason)}</p> : null}</div>)}</div>
  </div>;
}
