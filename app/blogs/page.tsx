import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

export default async function BlogsPage() {
  const supabase = await createClient();
  const { data: blogs } = await supabase
    .from("blogs")
    .select("id,title,slug,excerpt,published_at,status")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Insights & Blogs</h1>
      <div className="mt-8 space-y-4">
        {blogs?.map((blog) => (
          <article key={blog.id} className="rounded-xl border bg-white p-5">
            <h2 className="text-xl font-medium">{blog.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{blog.excerpt}</p>
            <Link href={`/blogs/${blog.slug}`} className="mt-4 inline-block text-brand-600">
              Read more
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
