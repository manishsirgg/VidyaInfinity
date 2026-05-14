"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  label: string;
  src: string | null | undefined;
  alt: string;
  missingText: string;
  className: string;
};

export function ModerationImagePreview({ label, src, alt, missingText, className }: Props) {
  const [failed, setFailed] = useState(false);
  const normalized = typeof src === "string" ? src.trim() : "";
  const hasImage = normalized.length > 0 && !failed;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-700">{label}</p>
      {hasImage ? (
        <Image
          src={normalized}
          alt={alt}
          width={1200}
          height={675}
          unoptimized
          onError={() => setFailed(true)}
          className={className}
        />
      ) : (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 text-xs text-slate-500">
          {failed ? "Image preview unavailable" : missingText}
        </div>
      )}
    </div>
  );
}
