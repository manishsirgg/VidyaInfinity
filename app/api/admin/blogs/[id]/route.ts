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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json();

  const title = body.title !== undefined ? String(body.title).trim() : undefined;
  const content = body.content !== undefined ? String(body.content).trim() : undefined;
  const excerpt = body.excerpt !== undefined ? String(body.excerpt).trim() : undefined;
  const status = body.status !== undefined ? normalizeBlogStatus(body.status) : undefined;
  const slug = body.slug !== undefined ? toSlug(String(body.slug).trim() || String(title ?? "")) : undefined;
  const featured = body.featured !== undefined ? Boolean(body.featured) : undefined;
  const seoTitle = body.seo_title !== undefined ? String(body.seo_title ?? "").trim() || null : undefined;
  const seoDescription = body.seo_description !== undefined ? String(body.seo_description ?? "").trim() || null : undefined;
  const canonicalUrl = body.canonical_url !== undefined ? String(body.canonical_url ?? "").trim() || null : undefined;
  const coverImageUrlInput = body.cover_image_url !== undefined ? String(body.cover_image_url ?? "").trim() || null : undefined;
  const requestedPublishedAt = body.published_at !== undefined ? String(body.published_at ?? "").trim() : undefined;

  const categoryIds = body.category_ids !== undefined ? parseIdList(body.category_ids) : undefined;
  const tagIds = body.tag_ids !== undefined ? parseIdList(body.tag_ids) : undefined;
  const mediaItems = body.media !== undefined ? parseMediaItems(body.media) : undefined;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) {
    updates.content = content;
    updates.metadata = {
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      reading_time_minutes: calculateReadingTime(content),
    };
  }
  if (excerpt !== undefined) updates.excerpt = excerpt;
  if (status !== undefined) updates.status = status;
  if (slug !== undefined) updates.slug = slug;
  if (featured !== undefined) updates.featured = featured;
  if (seoTitle !== undefined) updates.seo_title = seoTitle;
  if (seoDescription !== undefined) updates.seo_description = seoDescription;
  if (canonicalUrl !== undefined) updates.canonical_url = canonicalUrl;

  if (status === "published") {
    updates.published_at = requestedPublishedAt || new Date().toISOString();
  } else if (requestedPublishedAt !== undefined) {
    updates.published_at = requestedPublishedAt || null;
  }

  if (coverImageUrlInput !== undefined) {
    updates.cover_image_url = coverImageUrlInput;
  } else if (mediaItems) {
    updates.cover_image_url = mediaItems.find((item) => item.is_cover)?.file_url ?? null;
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { data, error } = await admin.data
    .from("blogs")
    .update(updates)
    .eq("id", id)
    .select("id,title,slug,excerpt,content,status,published_at,created_at,updated_at,cover_image_url,featured,seo_title,seo_description,canonical_url,metadata")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (categoryIds) {
    const { error: deleteError } = await admin.data.from("blog_post_categories").delete().eq("blog_id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (categoryIds.length) {
      const { error: categoryError } = await admin.data
        .from("blog_post_categories")
        .insert(categoryIds.map((categoryId) => ({ blog_id: id, category_id: categoryId })));
      if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 500 });
    }
  }

  if (tagIds) {
    const { error: deleteError } = await admin.data.from("blog_post_tags").delete().eq("blog_id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (tagIds.length) {
      const { error: tagError } = await admin.data.from("blog_post_tags").insert(tagIds.map((tagId) => ({ blog_id: id, tag_id: tagId })));
      if (tagError) return NextResponse.json({ error: tagError.message }, { status: 500 });
    }
  }

  if (mediaItems) {
    const { error: deleteError } = await admin.data.from("blog_media").delete().eq("blog_id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (mediaItems.length) {
      const { error: mediaError } = await admin.data.from("blog_media").insert(
        mediaItems.map((media) => ({
          blog_id: id,
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
  }

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "BLOG_UPDATED",
    targetTable: "blogs",
    targetId: id,
    metadata: { title: data.title, status: data.status, slug: data.slug },
  });

  return NextResponse.json({ ok: true, blog: data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  await admin.data.from("blog_post_categories").delete().eq("blog_id", id);
  await admin.data.from("blog_post_tags").delete().eq("blog_id", id);
  await admin.data.from("blog_media").delete().eq("blog_id", id);

  const { error } = await admin.data.from("blogs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminAuditLog({
    adminUserId: auth.user.id,
    action: "BLOG_DELETED",
    targetTable: "blogs",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
