import { BlogManagement } from "@/components/admin/blog-management";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const [blogsRes, categoriesRes, tagsRes, postCategoriesRes, postTagsRes, mediaRes] = await Promise.all([
    supabase
      .from("blogs")
      .select("id,title,slug,excerpt,content,status,published_at,created_at,updated_at,cover_image_url,featured,seo_title,seo_description,canonical_url,metadata")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase.from("blog_categories").select("id,name,slug,is_active").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("blog_tags").select("id,name,slug,is_active").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("blog_post_categories").select("blog_id,category_id"),
    supabase.from("blog_post_tags").select("blog_id,tag_id"),
    supabase.from("blog_media").select("blog_id,media_type,file_url,alt_text,caption,sort_order,is_cover,metadata").order("sort_order", { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Blogs</h1>
      <p className="mt-2 text-sm text-slate-600">Create, manage, preview, and publish blog content from one CMS-style workspace.</p>
      <BlogManagement
        initialBlogs={blogsRes.data ?? []}
        categories={categoriesRes.data ?? []}
        tags={tagsRes.data ?? []}
        blogPostCategories={postCategoriesRes.data ?? []}
        blogPostTags={postTagsRes.data ?? []}
        blogMedia={mediaRes.data ?? []}
      />
    </div>
  );
}
