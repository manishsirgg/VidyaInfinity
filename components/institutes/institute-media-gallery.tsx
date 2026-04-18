"use client";

import { useMemo, useState } from "react";

type MediaItem = {
  id: string;
  mediaType: "image" | "video";
  url: string | null;
  fileName: string | null;
};

type InstituteMediaGalleryProps = {
  mediaItems: MediaItem[];
  instituteName: string;
};

export function InstituteMediaGallery({ mediaItems, instituteName }: InstituteMediaGalleryProps) {
  const validItems = useMemo(() => mediaItems.filter((item) => item.url), [mediaItems]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (validItems.length === 0) {
    return null;
  }

  const openAtIndex = (index: number) => setActiveIndex(index);
  const closeModal = () => setActiveIndex(null);
  const showPrevious = () => setActiveIndex((prev) => (prev == null ? 0 : (prev - 1 + validItems.length) % validItems.length));
  const showNext = () => setActiveIndex((prev) => (prev == null ? 0 : (prev + 1) % validItems.length));

  return (
    <>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {validItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openAtIndex(index)}
            className="group relative overflow-hidden rounded-md border text-left"
          >
            {item.mediaType === "video" ? (
              <video className="h-56 w-full object-cover" src={item.url ?? undefined} muted preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="h-56 w-full object-cover" src={item.url ?? ""} alt={item.fileName ?? `${instituteName} media`} />
            )}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/50 px-3 py-2 text-xs text-white opacity-0 transition group-hover:opacity-100">
              Click to open
            </span>
          </button>
        ))}
      </div>

      {activeIndex != null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true">
          <button
            type="button"
            onClick={closeModal}
            className="absolute right-4 top-4 rounded-md bg-white/90 px-3 py-1 text-sm font-medium text-slate-800"
          >
            Close
          </button>
          <div className="relative w-full max-w-5xl">
            <button
              type="button"
              onClick={showPrevious}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800"
              aria-label="Previous media"
            >
              ‹
            </button>

            <div className="mx-10 max-h-[75vh] overflow-hidden rounded-lg bg-black">
              {validItems[activeIndex].mediaType === "video" ? (
                <video
                  className="max-h-[75vh] w-full object-contain"
                  src={validItems[activeIndex].url ?? undefined}
                  controls
                  autoPlay
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="max-h-[75vh] w-full object-contain"
                  src={validItems[activeIndex].url ?? ""}
                  alt={validItems[activeIndex].fileName ?? `${instituteName} media`}
                />
              )}
            </div>

            <button
              type="button"
              onClick={showNext}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-semibold text-slate-800"
              aria-label="Next media"
            >
              ›
            </button>

            <div className="mt-3 flex gap-2 overflow-x-auto rounded-md bg-white/10 p-2">
              {validItems.map((item, index) => (
                <button
                  key={`${item.id}-thumb`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`overflow-hidden rounded border ${index === activeIndex ? "border-white" : "border-white/40"}`}
                >
                  {item.mediaType === "video" ? (
                    <video className="h-16 w-24 object-cover" src={item.url ?? undefined} muted preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="h-16 w-24 object-cover" src={item.url ?? ""} alt={item.fileName ?? `${instituteName} media`} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
