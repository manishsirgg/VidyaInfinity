import type { Route } from "next";
import Link from "next/link";

import { calculateReadingTime } from "@/lib/blog/content";
import { createClient } from "@/lib/supabase/server";

type BlogCategoryPivot = { blog_id: string; category_id: string };
type BlogTagPivot = { blog_id: string; tag_id: string };
type BlogCategory = { id: string; name: string; slug: string };
type BlogTag = { id: string; name: string; slug: string };

export default async function BlogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; category?: string; tag?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const query = String(params.q ?? "").trim().toLowerCase();
  const categoryFilter = String(params.category ?? "").trim().toLowerCase();
  const tagFilter = String(params.tag ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const [blogsRes, categoriesRes, tagsRes, postCategoriesRes, postTagsRes] = await Promise.all([
    supabase
      .from("blogs")
      .select("id,title,slug,excerpt,content,published_at,status,cover_image_url,featured")
      .eq("status", "published")
      .eq("is_deleted", false)
      .order("published_at", { ascending: false }),
    supabase.from("blog_categories").select("id,name,slug").eq("is_active", true),
    supabase.from("blog_tags").select("id,name,slug").eq("is_active", true),
    supabase.from("blog_post_categories").select("blog_id,category_id"),
    supabase.from("blog_post_tags").select("blog_id,tag_id"),
  ]);

  const categories = (categoriesRes.data ?? []) as BlogCategory[];
  const tags = (tagsRes.data ?? []) as BlogTag[];
  const categoryById = new Map(categories.map((item) => [item.id, item]));
  const tagById = new Map(tags.map((item) => [item.id, item]));

  const categoryIdsByBlog = new Map<string, string[]>();
  for (const row of (postCategoriesRes.data ?? []) as BlogCategoryPivot[]) {
    categoryIdsByBlog.set(row.blog_id, [...(categoryIdsByBlog.get(row.blog_id) ?? []), row.category_id]);
  }

  const tagIdsByBlog = new Map<string, string[]>();
  for (const row of (postTagsRes.data ?? []) as BlogTagPivot[]) {
    tagIdsByBlog.set(row.blog_id, [...(tagIdsByBlog.get(row.blog_id) ?? []), row.tag_id]);
  }

  const blogs = (blogsRes.data ?? []).filter((blog) => {
    const blogCategories = (categoryIdsByBlog.get(blog.id) ?? []).map((id) => categoryById.get(id)?.slug).filter(Boolean);
    const blogTags = (tagIdsByBlog.get(blog.id) ?? []).map((id) => tagById.get(id)?.slug).filter(Boolean);

    const matchesQuery =
      !query || [blog.title, blog.excerpt ?? "", blog.content ?? ""].some((value) => value.toLowerCase().includes(query));
    const matchesCategory = !categoryFilter || blogCategories.includes(categoryFilter);
    const matchesTag = !tagFilter || blogTags.includes(tagFilter);

    return matchesQuery && matchesCategory && matchesTag;
  });

  const featuredBlogs = blogs.filter((item) => item.featured).slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Insights & Blogs</h1>

      <form className="mt-6 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
        <input name="q" defaultValue={query} placeholder="Search blogs" className="rounded border px-3 py-2 text-sm md:col-span-2" />
        <select name="category" defaultValue={categoryFilter} className="rounded border px-3 py-2 text-sm">
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
        <select name="tag" defaultValue={tagFilter} className="rounded border px-3 py-2 text-sm">
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.slug}>
              {tag.name}
            </option>
          ))}
        </select>
        <button className="rounded bg-brand-600 px-4 py-2 text-sm text-white md:col-span-4" type="submit">
          Apply filters
        </button>
      </form>

      {featuredBlogs.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Featured posts</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {featuredBlogs.map((blog) => (
              <Link key={blog.id} href={`/blogs/${blog.slug}` as Route} className="rounded-xl border bg-white p-4 hover:border-brand-300">
                {blog.cover_image_url ? <img src={blog.cover_image_url} alt={blog.title} className="h-36 w-full rounded object-cover" /> : null}
                <h3 className="mt-3 text-lg font-medium">{blog.title}</h3>
                <p className="mt-1 text-sm text-slate-600 line-clamp-3">{blog.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-8 space-y-4">
        {blogs.map((blog) => {
          const blogCategories = (categoryIdsByBlog.get(blog.id) ?? []).map((id) => categoryById.get(id)).filter(Boolean) as BlogCategory[];
          const blogTags = (tagIdsByBlog.get(blog.id) ?? []).map((id) => tagById.get(id)).filter(Boolean) as BlogTag[];

          return (
            <Link href={`/blogs/${blog.slug}` as Route} key={blog.id} className="group block rounded-xl border bg-white p-5 transition hover:border-brand-300">
              <article>
                {blog.cover_image_url ? <img src={blog.cover_image_url} alt={blog.title} className="h-44 w-full rounded object-cover" /> : null}
                <h2 className="mt-4 text-xl font-medium">{blog.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{blog.excerpt}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {blog.published_at ? new Date(blog.published_at).toLocaleDateString() : "Unpublished"} · ~{calculateReadingTime(blog.content ?? "")} min read
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {blogCategories.map((category) => (
                    <span key={category.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {category.name}
                    </span>
                  ))}
                  {blogTags.map((tag) => (
                    <span key={tag.id} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                      #{tag.name}
                    </span>
                  ))}
                </div>
                <p className="mt-4 inline-block text-brand-600 group-hover:underline">Read more</p>
              </article>
            </Link>
          );
        })}

        {blogs.length === 0 ? <p className="rounded border border-dashed p-5 text-sm text-slate-500">No published blogs matched your filters.</p> : null}
      </div>
    </div>
  );
}
