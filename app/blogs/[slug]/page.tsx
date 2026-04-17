import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function BlogDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: blog } = await supabase
    .from("blogs")
    .select("title,content,published_at,status")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!blog) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{blog.title}</h1>
      <p className="mt-2 text-sm text-slate-500">Published on {new Date(blog.published_at).toLocaleDateString()}</p>
      <div className="prose mt-8 max-w-none rounded-xl border bg-white p-6">{blog.content}</div>
    </article>
  );
}
