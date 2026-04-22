import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  kind: "course" | "institute" | "blog" | "test" | "webinar";
};

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "");
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ items: [] as SearchItem[] });
  }

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const term = `%${escapeLike(query)}%`;

  const [coursesRes, blogsRes, testsRes, institutesRes, webinarsRes] = await Promise.all([
    admin.data
      .from("courses")
      .select("id,title,category,status")
      .eq("status", "approved")
      .or(`title.ilike.${term},summary.ilike.${term}`)
      .limit(5),
    admin.data
      .from("blogs")
      .select("id,title,slug,status")
      .eq("status", "published")
      .or(`title.ilike.${term},excerpt.ilike.${term}`)
      .limit(5),
    admin.data
      .from("psychometric_tests")
      .select("id,title,slug,is_active")
      .eq("is_active", true)
      .or(`title.ilike.${term},description.ilike.${term}`)
      .limit(5),
    admin.data
      .from("institutes")
      .select("id,name,slug,status")
      .eq("status", "approved")
      .or(`name.ilike.${term},description.ilike.${term}`)
      .limit(5),
    admin.data
      .from("webinars")
      .select("id,title,description,faculty_name,webinar_mode,approval_status,is_public,is_deleted,status")
      .eq("approval_status", "approved")
      .eq("is_public", true)
      .eq("is_deleted", false)
      .in("status", ["scheduled", "live"])
      .or(`title.ilike.${term},description.ilike.${term},faculty_name.ilike.${term}`)
      .limit(5),
  ]);

  const items: SearchItem[] = [];

  for (const row of coursesRes.data ?? []) {
    items.push({
      id: row.id,
      title: row.title,
      subtitle: `Course${row.category ? ` · ${row.category}` : ""}`,
      href: `/courses/${row.id}`,
      kind: "course",
    });
  }

  for (const row of institutesRes.data ?? []) {
    items.push({
      id: row.id,
      title: row.name,
      subtitle: "Institute",
      href: row.slug ? `/institutes/${row.slug}` : "/institutes",
      kind: "institute",
    });
  }

  for (const row of blogsRes.data ?? []) {
    items.push({
      id: row.id,
      title: row.title,
      subtitle: "Blog",
      href: `/blogs/${row.slug}`,
      kind: "blog",
    });
  }

  for (const row of testsRes.data ?? []) {
    items.push({
      id: row.id,
      title: row.title,
      subtitle: "Psychometric Test",
      href: `/psychometric-tests/${row.slug}`,
      kind: "test",
    });
  }

  for (const row of webinarsRes.data ?? []) {
    items.push({
      id: row.id,
      title: row.title,
      subtitle: `Webinar · ${row.webinar_mode === "paid" ? "Paid" : "Free"}${row.faculty_name ? ` · ${row.faculty_name}` : ""}`,
      href: `/webinars/${row.id}`,
      kind: "webinar",
    });
  }

  const ranked = items
    .sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(query.toLowerCase()) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 12);

  return NextResponse.json({ items: ranked });
}
