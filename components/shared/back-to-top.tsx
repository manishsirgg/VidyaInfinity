"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const SHOW_AFTER_PX = 400;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
      }}
      className="fixed bottom-20 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-brand-200 bg-white text-brand-700 shadow-lg transition hover:-translate-y-0.5 hover:border-brand-500 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:bottom-24 sm:right-6"
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
