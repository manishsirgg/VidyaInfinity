import type { Metadata } from "next";

import { siteConfig } from "@/lib/constants/site";

export const DEFAULT_SHARE_IMAGE = "/brand/vidyainfinitylogo.png";

// Social crawlers require publicly accessible absolute URLs.
export function resolveShareImage(fileUrl: string | null | undefined, bucket: "course-media" | "institute-media"): string | null {
  const raw = fileUrl?.trim();
  if (!raw) return null;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^http:\/\//i.test(raw)) return null;
  const path = raw.replace(/^\/+/, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  return supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
    : null;
}

export function makeShareMetadata(args: {
  title: string;
  description: string;
  path: string;
  image?: string | null;
}): Metadata {
  const title = args.title;
  const description = args.description.trim().replace(/\s+/g, " ").slice(0, 240);
  const image = args.image || DEFAULT_SHARE_IMAGE;
  const url = new URL(args.path, siteConfig.url).toString();
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: siteConfig.name,
      type: "website",
      images: [{ url: image, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
