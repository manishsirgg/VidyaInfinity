"use client";

import type { Route } from "next";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { calculateReadingTime, markdownToHtml, toSlug } from "@/lib/blog/content";

type BlogItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  cover_image_url: string | null;
  featured: boolean | null;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  metadata: Record<string, unknown> | null;
};

type OptionItem = { id: string; name: string; slug: string; is_active?: boolean | null };
type PivotCategory = { blog_id: string; category_id: string };
type PivotTag = { blog_id: string; tag_id: string };
type BlogMedia = {
  blog_id: string;
  media_type: string;
  file_url: string;
  alt_text: string | null;
  caption: string | null;
  sort_order: number | null;
  is_cover: boolean | null;
  metadata: Record<string, unknown> | null;
};

type EditorMedia = {
  file_url: string;
  media_type: "image" | "video" | "document";
  alt_text: string;
  caption: string;
  sort_order: number;
  is_cover: boolean;
};

type BlogFormState = {
  id: string | null;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: "draft" | "published" | "archived";
  published_at: string;
  cover_image_url: string;
  featured: boolean;
  seo_title: string;
  seo_description: string;
  canonical_url: string;
  category_ids: string[];
  tag_ids: string[];
  media: EditorMedia[];
};

const PAGE_SIZE = 8;

const emptyForm: BlogFormState = {
  id: null,
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  status: "draft",
  published_at: "",
  cover_image_url: "",
  featured: false,
  seo_title: "",
  seo_description: "",
  canonical_url: "",
  category_ids: [],
  tag_ids: [],
  media: [],
};

function toLocalDatetimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

export function BlogManagement({
  initialBlogs,
  categories,
  tags,
  blogPostCategories,
  blogPostTags,
  blogMedia,
}: {
  initialBlogs: BlogItem[];
  categories: OptionItem[];
  tags: OptionItem[];
  blogPostCategories: PivotCategory[];
  blogPostTags: PivotTag[];
  blogMedia: BlogMedia[];
}) {
  const [blogs, setBlogs] = useState(initialBlogs);
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "archived">("all");
  const [sortBy, setSortBy] = useState<"created_at" | "updated_at" | "published_at">("updated_at");
  const [form, setForm] = useState<BlogFormState>(emptyForm);

  const categoryByBlog = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of blogPostCategories) {
      map.set(row.blog_id, [...(map.get(row.blog_id) ?? []), row.category_id]);
    }
    return map;
  }, [blogPostCategories]);

  const tagByBlog = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of blogPostTags) {
      map.set(row.blog_id, [...(map.get(row.blog_id) ?? []), row.tag_id]);
    }
    return map;
  }, [blogPostTags]);

  const mediaByBlog = useMemo(() => {
    const map = new Map<string, EditorMedia[]>();
    for (const row of blogMedia) {
      const list = map.get(row.blog_id) ?? [];
      const mediaType = row.media_type === "video" || row.media_type === "document" ? row.media_type : "image";
      list.push({
        file_url: row.file_url,
        media_type: mediaType,
        alt_text: row.alt_text ?? "",
        caption: row.caption ?? "",
        sort_order: row.sort_order ?? 0,
        is_cover: Boolean(row.is_cover),
      });
      map.set(row.blog_id, list);
    }
    return map;
  }, [blogMedia]);

  const counts = useMemo(() => {
    return blogs.reduce(
      (acc, blog) => {
        if (blog.status === "published") acc.published += 1;
        else if (blog.status === "draft") acc.draft += 1;
        else acc.archived += 1;
        return acc;
      },
      { published: 0, draft: 0, archived: 0 }
    );
  }, [blogs]);

  const filteredBlogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = blogs
      .filter((blog) => (statusFilter === "all" ? true : blog.status === statusFilter))
      .filter((blog) => {
        if (!term) return true;
        return [blog.title, blog.slug, blog.excerpt ?? ""].some((value) => value.toLowerCase().includes(term));
      })
      .sort((a, b) => {
        const left = a[sortBy] ? new Date(a[sortBy] as string).getTime() : 0;
        const right = b[sortBy] ? new Date(b[sortBy] as string).getTime() : 0;
        return right - left;
      });

    return list;
  }, [blogs, search, sortBy, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredBlogs.length / PAGE_SIZE));
  const pagedBlogs = filteredBlogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function resetForm() {
    setForm(emptyForm);
  }

  function startEdit(blog: BlogItem) {
    setForm({
      id: blog.id,
      title: blog.title,
      slug: blog.slug,
      excerpt: blog.excerpt ?? "",
      content: blog.content ?? "",
      status: blog.status,
      published_at: toLocalDatetimeInput(blog.published_at),
      cover_image_url: blog.cover_image_url ?? "",
      featured: Boolean(blog.featured),
      seo_title: blog.seo_title ?? "",
      seo_description: blog.seo_description ?? "",
      canonical_url: blog.canonical_url ?? "",
      category_ids: categoryByBlog.get(blog.id) ?? [],
      tag_ids: tagByBlog.get(blog.id) ?? [],
      media: mediaByBlog.get(blog.id) ?? [],
    });
    setStatusMessage(`Editing “${blog.title}”.`);
  }

  function toggleIdSelection(ids: string[], id: string) {
    return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
  }

  async function uploadMedia(file: File, mediaKind: "cover" | "inline") {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("blogId", form.id ?? "draft");
    formData.set("mediaKind", mediaKind);

    const response = await fetch("/api/admin/blogs/upload-media", { method: "POST", body: formData });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error ?? "Unable to upload media");
    }

    return body.url as string;
  }

  async function submitBlog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim() || !form.excerpt.trim() || !form.content.trim()) {
      setStatusMessage("Title, excerpt, and content are required.");
      return;
    }

    setLoading(true);
    setStatusMessage("");

    const payload = {
      title: form.title,
      slug: form.slug || toSlug(form.title),
      excerpt: form.excerpt,
      content: form.content,
      status: form.status,
      published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
      cover_image_url: form.cover_image_url || null,
      featured: form.featured,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      canonical_url: form.canonical_url || null,
      category_ids: Array.from(new Set(form.category_ids)),
      tag_ids: Array.from(new Set(form.tag_ids)),
      media: form.media,
      metadata: {
        reading_time_minutes: calculateReadingTime(form.content),
      },
    };

    const isEdit = Boolean(form.id);
    const response = await fetch(isEdit ? `/api/admin/blogs/${form.id}` : "/api/admin/blogs", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatusMessage(body.error ?? "Unable to save blog");
      return;
    }

    const savedBlog = body.blog as BlogItem;
    setBlogs((prev) => {
      if (isEdit) return prev.map((item) => (item.id === savedBlog.id ? { ...item, ...savedBlog } : item));
      return [savedBlog, ...prev];
    });

    setStatusMessage(isEdit ? "Blog updated successfully." : "Blog created successfully.");
    if (!isEdit) resetForm();
  }

  async function quickStatusUpdate(blogId: string, status: "draft" | "published" | "archived") {
    setLoadingId(blogId);
    const response = await fetch(`/api/admin/blogs/${blogId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setStatusMessage(body.error ?? "Unable to update blog status");
      return;
    }

    setBlogs((prev) => prev.map((blog) => (blog.id === blogId ? { ...blog, ...body.blog } : blog)));
    setStatusMessage(`Blog status updated to ${status}.`);
  }

  async function archiveBlog(blogId: string) {
    if (!window.confirm("Archive this blog? It will be hidden from public listings.")) return;

    setLoadingId(blogId);
    const response = await fetch(`/api/admin/blogs/${blogId}`, { method: "DELETE" });
    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setStatusMessage(body.error ?? "Unable to archive blog");
      return;
    }

    setBlogs((prev) => prev.filter((blog) => blog.id !== blogId));
    if (form.id === blogId) resetForm();
    setStatusMessage("Blog archived.");
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-4 rounded-xl border bg-white p-4">
        <div className="grid gap-3 rounded border bg-slate-50 p-3 text-sm sm:grid-cols-3">
          <p>Published: {counts.published}</p>
          <p>Drafts: {counts.draft}</p>
          <p>Archived: {counts.archived}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, slug, excerpt" className="rounded border px-3 py-2 text-sm sm:col-span-2" />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="rounded border px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="rounded border px-3 py-2 text-sm">
            <option value="updated_at">Sort by updated</option>
            <option value="created_at">Sort by created</option>
            <option value="published_at">Sort by published</option>
          </select>
        </div>

        {pagedBlogs.length === 0 ? <p className="rounded border border-dashed p-4 text-sm text-slate-500">No blogs found for this filter.</p> : null}

        <div className="space-y-3">
          {pagedBlogs.map((blog) => {
            const readingMinutes = calculateReadingTime(blog.content ?? "");
            return (
              <article key={blog.id} className="rounded border bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {blog.title} · <span className="uppercase">{blog.status}</span>
                  </p>
                  <button type="button" onClick={() => startEdit(blog)} className="rounded border px-2 py-1 text-xs hover:bg-slate-50">
                    Edit
                  </button>
                </div>
                <p className="text-slate-600">/{blog.slug}</p>
                <p className="mt-1 text-slate-700">{blog.excerpt ?? "No excerpt"}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Created: {blog.created_at ? new Date(blog.created_at).toLocaleString() : "-"} · Updated: {blog.updated_at ? new Date(blog.updated_at).toLocaleString() : "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500">Reading time: ~{readingMinutes} min</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button disabled={loadingId === blog.id} onClick={() => quickStatusUpdate(blog.id, "draft")} className="rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:opacity-60">
                    Save Draft
                  </button>
                  <button disabled={loadingId === blog.id} onClick={() => quickStatusUpdate(blog.id, "published")} className="rounded bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-60">
                    Publish
                  </button>
                  <button disabled={loadingId === blog.id} onClick={() => quickStatusUpdate(blog.id, "archived")} className="rounded bg-amber-700 px-2 py-1 text-xs text-white disabled:opacity-60">
                    Archive
                  </button>
                  <button disabled={loadingId === blog.id} onClick={() => archiveBlog(blog.id)} className="rounded bg-rose-700 px-2 py-1 text-xs text-white disabled:opacity-60">
                    Archive
                  </button>
                  <Link href={`/blogs/${blog.slug}` as Route} className="rounded border px-2 py-1 text-xs hover:bg-slate-50" target="_blank">
                    Preview
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} className="rounded border px-3 py-1 text-sm disabled:opacity-50">
            Previous
          </button>
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </p>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} className="rounded border px-3 py-1 text-sm disabled:opacity-50">
            Next
          </button>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{form.id ? "Edit blog" : "Create blog"}</h2>
          {form.id ? (
            <button type="button" onClick={resetForm} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
              Cancel edit
            </button>
          ) : null}
        </div>

        <form onSubmit={submitBlog} className="space-y-3">
          <input required value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value, slug: prev.slug || toSlug(event.target.value) }))} placeholder="Title" className="w-full rounded border px-3 py-2" />
          <input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: toSlug(event.target.value) }))} placeholder="Slug" className="w-full rounded border px-3 py-2" />
          <textarea required value={form.excerpt} onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))} placeholder="Excerpt" rows={3} className="w-full rounded border px-3 py-2" />
          <div className="grid gap-3 md:grid-cols-2">
            <textarea
              required
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              placeholder="Markdown content"
              rows={12}
              className="w-full rounded border px-3 py-2 font-mono text-sm"
            />
            <div className="rounded border bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">Live markdown preview</p>
              <div className="prose mt-2 max-w-none" dangerouslySetInnerHTML={{ __html: markdownToHtml(form.content) }} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as BlogFormState["status"] }))} className="rounded border px-3 py-2">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
            <label className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
              <input type="checkbox" checked={form.featured} onChange={(event) => setForm((prev) => ({ ...prev, featured: event.target.checked }))} />
              Featured post
            </label>
          </div>

          <input value={form.cover_image_url} onChange={(event) => setForm((prev) => ({ ...prev, cover_image_url: event.target.value }))} placeholder="Cover image URL" className="w-full rounded border px-3 py-2" />
          <input type="datetime-local" value={form.published_at} onChange={(event) => setForm((prev) => ({ ...prev, published_at: event.target.value }))} className="w-full rounded border px-3 py-2" />

          <div className="grid gap-3 md:grid-cols-2">
            <input value={form.seo_title} onChange={(event) => setForm((prev) => ({ ...prev, seo_title: event.target.value }))} placeholder="SEO title" className="w-full rounded border px-3 py-2" />
            <input value={form.canonical_url} onChange={(event) => setForm((prev) => ({ ...prev, canonical_url: event.target.value }))} placeholder="Canonical URL" className="w-full rounded border px-3 py-2" />
          </div>
          <textarea value={form.seo_description} onChange={(event) => setForm((prev) => ({ ...prev, seo_description: event.target.value }))} placeholder="SEO description" rows={3} className="w-full rounded border px-3 py-2" />

          <div className="grid gap-3 md:grid-cols-2">
            <fieldset className="rounded border p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Categories</legend>
              <div className="mt-2 space-y-1">
                {categories.map((category) => (
                  <label key={category.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.category_ids.includes(category.id)}
                      onChange={() => setForm((prev) => ({ ...prev, category_ids: toggleIdSelection(prev.category_ids, category.id) }))}
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="rounded border p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Tags</legend>
              <div className="mt-2 space-y-1">
                {tags.map((tag) => (
                  <label key={tag.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.tag_ids.includes(tag.id)} onChange={() => setForm((prev) => ({ ...prev, tag_ids: toggleIdSelection(prev.tag_ids, tag.id) }))} />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="rounded border p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Media gallery</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="rounded border px-3 py-1.5 text-xs hover:bg-slate-50">
                Upload cover
                <span className="ml-1 text-[11px] text-slate-500">(recommended: 1200×630 px, 1.91:1)</span>
                <input
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      const url = await uploadMedia(file, "cover");
                      setForm((prev) => ({ ...prev, cover_image_url: url }));
                      setStatusMessage("Cover media uploaded.");
                    } catch (error) {
                      setStatusMessage(error instanceof Error ? error.message : "Unable to upload cover.");
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              <label className="rounded border px-3 py-1.5 text-xs hover:bg-slate-50">
                Upload gallery media
                <span className="ml-1 text-[11px] text-slate-500">(images: ideally 16:9 or 1:1)</span>
                <input
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      const url = await uploadMedia(file, "inline");
                      setForm((prev) => ({
                        ...prev,
                        media: [
                          ...prev.media,
                          {
                            file_url: url,
                            media_type: file.type.startsWith("video/") ? "video" : file.type.startsWith("application/") ? "document" : "image",
                            alt_text: "",
                            caption: "",
                            sort_order: prev.media.length,
                            is_cover: false,
                          },
                        ],
                      }));
                      setStatusMessage("Gallery media uploaded.");
                    } catch (error) {
                      setStatusMessage(error instanceof Error ? error.message : "Unable to upload gallery media.");
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            <div className="mt-3 space-y-2">
              {form.media.map((item, index) => (
                <div key={`${item.file_url}-${index}`} className="grid gap-2 rounded border p-2 md:grid-cols-[1fr_1fr_120px_80px_auto]">
                  <input value={item.file_url} onChange={(event) => setForm((prev) => ({ ...prev, media: prev.media.map((media, i) => (i === index ? { ...media, file_url: event.target.value } : media)) }))} className="rounded border px-2 py-1 text-xs" placeholder="File URL" />
                  <input value={item.alt_text} onChange={(event) => setForm((prev) => ({ ...prev, media: prev.media.map((media, i) => (i === index ? { ...media, alt_text: event.target.value } : media)) }))} className="rounded border px-2 py-1 text-xs" placeholder="Alt text" />
                  <input value={item.caption} onChange={(event) => setForm((prev) => ({ ...prev, media: prev.media.map((media, i) => (i === index ? { ...media, caption: event.target.value } : media)) }))} className="rounded border px-2 py-1 text-xs" placeholder="Caption" />
                  <input type="number" value={item.sort_order} onChange={(event) => setForm((prev) => ({ ...prev, media: prev.media.map((media, i) => (i === index ? { ...media, sort_order: Number(event.target.value) || 0 } : media)) }))} className="rounded border px-2 py-1 text-xs" placeholder="Order" />
                  <button type="button" onClick={() => setForm((prev) => ({ ...prev, media: prev.media.filter((_, i) => i !== index) }))} className="rounded border px-2 py-1 text-xs text-rose-700 hover:bg-rose-50">
                    Remove
                  </button>
                </div>
              ))}
              {form.media.length === 0 ? <p className="text-xs text-slate-500">No additional media attached yet.</p> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button disabled={loading} className="rounded bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-60" type="submit">
              {loading ? "Saving..." : form.id ? "Update blog" : "Create blog"}
            </button>
            <button type="button" disabled={loading} onClick={() => setForm((prev) => ({ ...prev, status: "draft" }))} className="rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60">
              Save as draft
            </button>
          </div>
        </form>

        {statusMessage ? <p className="rounded border bg-slate-50 px-3 py-2 text-sm text-slate-700">{statusMessage}</p> : null}
      </section>
    </div>
  );
}
