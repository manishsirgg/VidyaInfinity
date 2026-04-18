"use client";

import { FormEvent, useMemo, useState } from "react";

type BlogItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: string;
  published_at: string | null;
  created_at: string | null;
};

export function BlogManagement({ initialBlogs }: { initialBlogs: BlogItem[] }) {
  const [blogs, setBlogs] = useState(initialBlogs);
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

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

  async function createBlog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/admin/blogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"),
        slug: formData.get("slug"),
        excerpt: formData.get("excerpt"),
        content: formData.get("content"),
        status: formData.get("status"),
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Unable to create blog");
      return;
    }

    const newBlog = body.blog as BlogItem;
    setBlogs((prev) => [newBlog, ...prev]);
    setMessage("Blog created successfully");
    event.currentTarget.reset();
  }

  async function updateStatus(id: string, status: "draft" | "published" | "archived") {
    setLoadingId(id);
    const response = await fetch(`/api/admin/blogs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setMessage(body.error ?? "Unable to update blog status");
      return;
    }

    setBlogs((prev) => prev.map((blog) => (blog.id === id ? { ...blog, ...body.blog } : blog)));
    setMessage(`Blog marked as ${status}`);
  }

  async function deleteBlog(id: string) {
    if (!window.confirm("Delete this blog? This action cannot be undone.")) return;

    setLoadingId(id);
    const response = await fetch(`/api/admin/blogs/${id}`, { method: "DELETE" });
    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setMessage(body.error ?? "Unable to delete blog");
      return;
    }

    setBlogs((prev) => prev.filter((blog) => blog.id !== id));
    setMessage("Blog deleted");
  }

  return (
    <div className="mt-4 space-y-6">
      <div className="grid gap-3 rounded border bg-white p-4 text-sm sm:grid-cols-3">
        <p>Published: {counts.published}</p>
        <p>Drafts: {counts.draft}</p>
        <p>Archived: {counts.archived}</p>
      </div>

      <form onSubmit={createBlog} className="grid gap-3 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Create Blog</h2>
        <input required name="title" placeholder="Title" className="rounded border px-3 py-2" />
        <input name="slug" placeholder="Slug (optional)" className="rounded border px-3 py-2" />
        <input required name="excerpt" placeholder="Excerpt" className="rounded border px-3 py-2" />
        <textarea required name="content" placeholder="Blog content" rows={5} className="rounded border px-3 py-2" />
        <select name="status" className="rounded border px-3 py-2" defaultValue="draft">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <button className="w-fit rounded bg-brand-600 px-3 py-2 text-white" type="submit">
          Create Blog
        </button>
      </form>

      <div className="space-y-3">
        {blogs.map((blog) => (
          <article key={blog.id} className="rounded border bg-white p-4 text-sm">
            <p className="font-medium">
              {blog.title} · <span className="uppercase">{blog.status}</span>
            </p>
            <p className="text-slate-600">/{blog.slug}</p>
            <p className="mt-1 text-slate-700">{blog.excerpt ?? "No excerpt"}</p>
            <p className="mt-1 text-xs text-slate-500">
              Created: {blog.created_at ? new Date(blog.created_at).toLocaleString() : "-"} · Published: {blog.published_at ? new Date(blog.published_at).toLocaleString() : "-"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                disabled={loadingId === blog.id}
                onClick={() => updateStatus(blog.id, "draft")}
                className="rounded bg-slate-700 px-2 py-1 text-xs text-white"
              >
                Mark Draft
              </button>
              <button
                disabled={loadingId === blog.id}
                onClick={() => updateStatus(blog.id, "published")}
                className="rounded bg-emerald-700 px-2 py-1 text-xs text-white"
              >
                Publish
              </button>
              <button
                disabled={loadingId === blog.id}
                onClick={() => updateStatus(blog.id, "archived")}
                className="rounded bg-amber-700 px-2 py-1 text-xs text-white"
              >
                Archive
              </button>
              <button
                disabled={loadingId === blog.id}
                onClick={() => deleteBlog(blog.id)}
                className="rounded bg-rose-700 px-2 py-1 text-xs text-white"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
