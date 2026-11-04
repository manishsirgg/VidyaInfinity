"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  children: ReactNode;
  courseCount: number;
};

export function InstituteCoursesCarousel({ children, courseCount }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  // Even two or three courses may overflow at mobile widths.
  const canScroll = courseCount > 2;

  function move(direction: -1 | 1) {
    const element = scroller.current;
    if (!element) return;
    // Scroll a viewport at a time, retaining the two-row layout.
    element.scrollBy({ left: direction * element.clientWidth, behavior: "smooth" });
  }

  return (
    <div>
      {canScroll ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Scroll to explore all {courseCount} courses</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label="Previous courses"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:border-brand-400 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label="Next courses"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:border-brand-400 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
      <div
        ref={scroller}
        aria-label="Institute courses"
        role="region"
        tabIndex={canScroll ? 0 : undefined}
        className="grid grid-flow-col grid-rows-2 auto-cols-[100%] gap-3 overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-2 md:auto-cols-[calc((100%-0.75rem)/2)] xl:auto-cols-[calc((100%-1.5rem)/3)]"
      >
        {children}
      </div>
    </div>
  );
}
