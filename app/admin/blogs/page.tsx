import { BlogManagement } from "@/components/admin/blog-management";
import { requireUser } from "@/lib/auth/get-session";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireUser("admin");
  const supabase = await createClient();

  const { data: blogs } = await supabase
    .from("blogs")
    .select("id,title,slug,excerpt,status,published_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Admin Blogs</h1>
      <p className="mt-2 text-sm text-slate-600">Create, publish, archive, and delete blogs from one place.</p>
      <BlogManagement initialBlogs={blogs ?? []} />
    </div>
  );
}
