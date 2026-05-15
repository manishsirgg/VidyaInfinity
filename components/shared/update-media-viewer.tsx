"use client";

import { useEffect, useState } from "react";

type UpdateMediaViewerProps = {
  mediaType: "image" | "video";
  src: string;
  alt?: string;
  className?: string;
};

export function UpdateMediaViewer({ mediaType, src, alt = "Update media", className = "" }: UpdateMediaViewerProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative mt-3 aspect-square w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-left transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${className}`}
        aria-label={`Open ${mediaType} in full view`}
      >
        {mediaType === "image" ? (
          <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <video src={src} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={alt} />
        )}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-slate-700 shadow hover:bg-white"
              aria-label="Close media viewer"
            >
              ✕
            </button>
            <div className="max-h-[90vh] max-w-[95vw]" onClick={(event) => event.stopPropagation()}>
              {mediaType === "image" ? (
                <img src={src} alt={alt} className="max-h-[85vh] max-w-[95vw] object-contain" />
              ) : (
                <video src={src} controls playsInline className="max-h-[85vh] max-w-[95vw] object-contain" />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
