import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { calculateReadingTime, markdownToHtml, stripMarkdown } from "@/lib/blog/content";
import { createClient } from "@/lib/supabase/server";

type BlogCategoryPivot = { blog_id: string; category_id: string };
type BlogTagPivot = { blog_id: string; tag_id: string };
type BlogCategory = { id: string; name: string; slug: string };
type BlogTag = { id: string; name: string; slug: string };

async function fetchBlog(slug: string) {
  const supabase = await createClient();
  const { data: blog } = await supabase
    .from("blogs")
    .select("id,title,slug,excerpt,content,published_at,status,cover_image_url,seo_title,seo_description,canonical_url")
    .eq("slug", slug)
    .eq("status", "published")
    .eq("is_deleted", false)
    .single();

  return blog;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const blog = await fetchBlog(slug);
  if (!blog) {
    return { title: "Blog not found" };
  }

  const title = blog.seo_title || blog.title;
  const description = blog.seo_description || blog.excerpt || stripMarkdown(blog.content).slice(0, 160);
  const canonical = blog.canonical_url || `/blogs/${blog.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonical,
      publishedTime: blog.published_at ?? undefined,
      images: blog.cover_image_url ? [{ url: blog.cover_image_url }] : undefined,
    },
  };
}

export default async function BlogDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const blog = await fetchBlog(slug);
  if (!blog) notFound();

  const [categoriesRes, tagsRes, postCategoriesRes, postTagsRes, relatedRes] = await Promise.all([
    supabase.from("blog_categories").select("id,name,slug").eq("is_active", true),
    supabase.from("blog_tags").select("id,name,slug").eq("is_active", true),
    supabase.from("blog_post_categories").select("blog_id,category_id").eq("blog_id", blog.id),
    supabase.from("blog_post_tags").select("blog_id,tag_id").eq("blog_id", blog.id),
    supabase
      .from("blogs")
      .select("id,title,slug,excerpt,published_at,status")
      .eq("status", "published")
    .eq("is_deleted", false)
      .neq("id", blog.id)
      .order("published_at", { ascending: false })
      .limit(4),
  ]);

  const categories = new Map((categoriesRes.data ?? []).map((item: BlogCategory) => [item.id, item]));
  const tags = new Map((tagsRes.data ?? []).map((item: BlogTag) => [item.id, item]));
  const blogCategories = ((postCategoriesRes.data ?? []) as BlogCategoryPivot[])
    .map((item) => categories.get(item.category_id))
    .filter(Boolean) as BlogCategory[];
  const blogTags = ((postTagsRes.data ?? []) as BlogTagPivot[])
    .map((item) => tags.get(item.tag_id))
    .filter(Boolean) as BlogTag[];

  return (
    <article className="mx-auto max-w-4xl px-4 py-12">
      {blog.cover_image_url ? <img src={blog.cover_image_url} alt={blog.title} className="h-72 w-full rounded-xl object-cover" /> : null}
      <h1 className="mt-6 text-4xl font-semibold">{blog.title}</h1>
      {blog.excerpt ? <p className="mt-3 text-lg text-slate-600">{blog.excerpt}</p> : null}
      <p className="mt-2 text-sm text-slate-500">
        Published on {blog.published_at ? new Date(blog.published_at).toLocaleDateString() : "-"} · ~{calculateReadingTime(blog.content)} min read
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
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
      <div className="prose mt-8 max-w-none rounded-xl border bg-white p-6" dangerouslySetInnerHTML={{ __html: markdownToHtml(blog.content) }} />

      {(relatedRes.data?.length ?? 0) > 0 ? (
        <section className="mt-10 border-t pt-8">
          <h2 className="text-xl font-semibold">Related posts</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(relatedRes.data ?? []).map((item) => (
              <Link key={item.id} href={`/blogs/${item.slug}`} className="rounded border bg-white p-4 hover:bg-slate-50">
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600 line-clamp-2">{item.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
