"use client";

import { useMemo, useState } from "react";

type CourseMediaItem = {
  id: string;
  type: string | null;
  fileUrl: string | null;
};

type CourseMediaGalleryProps = {
  mediaItems: CourseMediaItem[];
  courseTitle: string;
};

export function CourseMediaGallery({ mediaItems, courseTitle }: CourseMediaGalleryProps) {
  const validItems = useMemo(
    () =>
      mediaItems.filter((item) => item.fileUrl).map((item) => ({
        ...item,
        mediaType: String(item.type ?? "").toLowerCase() === "video" ? "video" : "image",
      })),
    [mediaItems],
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (validItems.length === 0) {
    return <p className="mt-2 text-sm text-slate-600">No media uploaded.</p>;
  }

  const showPrevious = () => setActiveIndex((prev) => (prev == null ? 0 : (prev - 1 + validItems.length) % validItems.length));
  const showNext = () => setActiveIndex((prev) => (prev == null ? 0 : (prev + 1) % validItems.length));

  return (
    <>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {validItems.map((item, index) => (
          <button
            key={`${item.fileUrl}-${index}`}
            type="button"
            onClick={() => setActiveIndex(index)}
            className="group relative overflow-hidden rounded-md border text-left"
          >
            {item.mediaType === "video" ? (
              <video className="h-48 w-full object-cover" src={item.fileUrl ?? undefined} muted preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="h-48 w-full object-cover" src={item.fileUrl ?? ""} alt={courseTitle} />
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
            onClick={() => setActiveIndex(null)}
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
                <video className="max-h-[75vh] w-full object-contain" src={validItems[activeIndex].fileUrl ?? undefined} controls autoPlay />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="max-h-[75vh] w-full object-contain" src={validItems[activeIndex].fileUrl ?? ""} alt={courseTitle} />
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
          </div>
        </div>
      ) : null}
    </>
  );
}
