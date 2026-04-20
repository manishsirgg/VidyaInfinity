import { NextResponse } from "next/server";

import { writeAdminAuditLog } from "@/lib/admin/audit-log";
import { requireApiUser } from "@/lib/auth/api-auth";
import { calculateReadingTime, normalizeBlogStatus, toSlug } from "@/lib/blog/content";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type RequestMediaItem = {
  file_url?: string;
  media_type?: string;
  alt_text?: string | null;
  caption?: string | null;
  sort_order?: number | null;
  is_cover?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

type ParsedMediaItem = {
  file_url: string;
  media_type: "image" | "video" | "document";
  alt_text: string | null;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  metadata: Record<string, unknown> | null;
};

function parseIdList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)));
}

function parseMediaItems(value: unknown): ParsedMediaItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const media = item as RequestMediaItem;
      const fileUrl = String(media.file_url ?? "").trim();
      if (!fileUrl) return null;

      const mediaType = String(media.media_type ?? "image").trim().toLowerCase();
      const normalizedType = mediaType === "video" || mediaType === "document" ? mediaType : "image";

      return {
        file_url: fileUrl,
        media_type: normalizedType,
        alt_text: media.alt_text ? String(media.alt_text).trim() : null,
        caption: media.caption ? String(media.caption).trim() : null,
        sort_order: Number(media.sort_order ?? 0) || 0,
        is_cover: Boolean(media.is_cover),
        metadata: media.metadata && typeof media.metadata === "object" ? media.metadata : null,
      };
    })
    .filter((item): item is ParsedMediaItem => Boolean(item));
}

export async function GET() {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("blogs")
    .select("id,title,slug,excerpt,content,status,published_at,created_at,updated_at,cover_image_url,featured,seo_title,seo_description,canonical_url,metadata")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ blogs: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const excerpt = String(body.excerpt ?? "").trim();
  const slug = toSlug(String(body.slug ?? "").trim() || title);
  const status = normalizeBlogStatus(body.status);
  const featured = Boolean(body.featured);
  const seoTitle = String(body.seo_title ?? "").trim() || null;
  const seoDescription = String(body.seo_description ?? "").trim() || null;
  const canonicalUrl = String(body.canonical_url ?? "").trim() || null;
  const coverImageInput = String(body.cover_image_url ?? "").trim() || null;
  const requestedPublishedAt = String(body.published_at ?? "").trim();

  const categoryIds = parseIdList(body.category_ids);
  const tagIds = parseIdList(body.tag_ids);
  const mediaItems = parseMediaItems(body.media);

  if (!title || !content || !excerpt) {
    return NextResponse.json({ error: "title, excerpt and content are required" }, { status: 400 });
  }

  if (!slug) {
    return NextResponse.json({ error: "Unable to generate slug" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const nowIso = new Date().toISOString();
  const publishedAt =
    status === "published"
      ? requestedPublishedAt || nowIso
      : requestedPublishedAt && new Date(requestedPublishedAt).toString() !== "Invalid Date"
        ? requestedPublishedAt
        : null;

  const coverFromMedia = mediaItems.find((media) => media.is_cover)?.file_url ?? null;
  const coverImageUrl = coverImageInput || coverFromMedia;

  const readingTime = calculateReadingTime(content);
  const metadata = {
    ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    reading_time_minutes: readingTime,
  };

  const { data, error } = await admin.data
    .from("blogs")
    .insert({
      title,
      slug,
      excerpt,
      content,
      status,
      published_at: publishedAt,
      created_by: auth.user.id,
      updated_at: nowIso,
      seo_title: seoTitle,
      seo_description: seoDescription,
      canonical_url: canonicalUrl,
      cover_image_url: coverImageUrl,
      featured,
      metadata,
    })
    .select("id,title,slug,excerpt,content,status,published_at,created_at,updated_at,cover_image_url,featured,seo_title,seo_description,canonical_url,metadata")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (categoryIds.length) {
    const { error: categoryError } = await admin.data
      .from("blog_post_categories")
      .insert(categoryIds.map((categoryId) => ({ blog_id: data.id, category_id: categoryId })));
    if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 500 });
  }

  if (tagIds.length) {
    const { error: tagError } = await admin.data.from("blog_post_tags").insert(tagIds.map((tagId) => ({ blog_id: data.id, tag_id: tagId })));
    if (tagError) return NextResponse.json({ error: tagError.message }, { status: 500 });
  }

  if (mediaItems.length) {
    const { error: mediaError } = await admin.data.from("blog_media").insert(
      mediaItems.map((media) => ({
        blog_id: data.id,
        media_type: media.media_type,
        file_url: media.file_url,
        alt_text: media.alt_text ?? null,
        caption: media.caption ?? null,
        sort_order: media.sort_order ?? 0,
        is_cover: Boolean(media.is_cover),
        metadata: media.metadata ?? null,
      }))
    );

    if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "BLOG_CREATED",
    targetTable: "blogs",
    targetId: data.id,
    metadata: { title: data.title, status: data.status, slug: data.slug },
  });

  return NextResponse.json({ ok: true, blog: data });
}
