"use client";

import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/shared/status-badge";

type InstituteUpdate = {
  id: string;
  content: string;
  status: string;
  created_at: string;
  rejection_reason?: string | null;
  image_url?: string | null;
  video_url?: string | null;
};

const MAX_CONTENT = 280;

export function InstituteUpdatesClient({ initialUpdates }: { initialUpdates: Array<Record<string, unknown>> }) {
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [updates, setUpdates] = useState<InstituteUpdate[]>(initialUpdates as InstituteUpdate[]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingUpdate = useMemo(() => updates.find((u) => u.id === editingId) ?? null, [editingId, updates]);

  async function submit() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("content", content);
      if (image) fd.append("image", image);
      if (video) fd.append("video", video);
      const res = await fetch("/api/institute/updates", { method: "POST", body: fd });
      if (!res.ok) {
        const payload = await res.json();
        alert(payload.error ?? "Failed");
        return;
      }
      location.reload();
    } finally {
      setSaving(false);
    }
  }

  async function removeUpdate(id: string) {
    if (!confirm("Delete this update? This cannot be undone.")) return;
    const res = await fetch(`/api/institute/updates?id=${id}`, { method: "DELETE" });
    if (!res.ok) return alert((await res.json()).error ?? "Failed to delete update");
    setUpdates((prev) => prev.filter((u) => u.id !== id));
    if (editingId === id) setEditingId(null);
  }

  async function updateMedia(action: "replace" | "remove" | "relocate", file?: File | null) {
    if (!editingUpdate) return;
    const fd = new FormData();
    fd.append("id", editingUpdate.id);
    fd.append("content", editingUpdate.content);
    fd.append("action", action);
    if (action === "replace" && file) {
      if (file.type.startsWith("image/")) fd.append("image", file);
      else fd.append("video", file);
    }
    const res = await fetch("/api/institute/updates", { method: "PATCH", body: fd });
    const payload = await res.json();
    if (!res.ok) return alert(payload.error ?? "Failed to update media");
    setUpdates((prev) => prev.map((u) => (u.id === payload.update.id ? payload.update : u)));
  }

  return (
    <div className="space-y-6">
      <section className="vi-card space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Create update</h2>
          <p className="text-sm text-slate-500">Share concise highlights with one image or one short video.</p>
        </div>
        <textarea
          className="vi-input min-h-32 w-full"
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, MAX_CONTENT))}
          placeholder="Share a short update..."
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>{content.length}/{MAX_CONTENT} characters</p>
          <p>Upload one image or one short video.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <span className="mb-2 block font-medium text-slate-700">Image</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { setImage(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setVideo(null); }} />
          </label>
          <label className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <span className="mb-2 block font-medium text-slate-700">Video</span>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(e) => { setVideo(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setImage(null); }} />
          </label>
        </div>
        <button disabled={saving || !content.trim()} onClick={submit} className="vi-button-primary disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? "Submitting..." : "Submit for Review"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Your updates</h2>
        {updates.map((u) => (
          <article key={u.id} className="vi-card space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={u.status ?? "draft"} />
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{new Date(u.created_at).toLocaleString()}</span>
                <button className="rounded border px-2 py-1 hover:bg-slate-50" onClick={() => setEditingId(editingId === u.id ? null : u.id)}>
                  Manage media
                </button>
                <button className="rounded border border-rose-200 px-2 py-1 text-rose-600 hover:bg-rose-50" onClick={() => removeUpdate(u.id)}>
                  Delete update
                </button>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{u.content}</p>
            {u.image_url ? <img src={u.image_url} alt="Update media" className="max-h-72 w-full rounded-xl object-cover" /> : null}
            {u.video_url ? <video src={u.video_url} controls className="max-h-72 w-full rounded-xl" /> : null}
            {u.rejection_reason ? <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">Rejection reason: {u.rejection_reason}</p> : null}

            {editingId === u.id ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-700">Media tools</p>
                <div className="flex flex-wrap gap-2">
                  <label className="rounded border bg-white px-3 py-2">
                    Replace media
                    <input className="ml-2" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={(e) => updateMedia("replace", e.target.files?.[0] ?? null)} />
                  </label>
                  <button className="rounded border bg-white px-3 py-2 hover:bg-slate-100" onClick={() => updateMedia("remove")}>Remove media</button>
                  <button className="rounded border bg-white px-3 py-2 hover:bg-slate-100" onClick={() => updateMedia("relocate")}>Relocate media path</button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
