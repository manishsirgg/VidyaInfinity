import Link from "next/link";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";

function instituteName(value: unknown) {
  if (Array.isArray(value)) return ((value[0] as { name?: string } | undefined)?.name ?? "Institute");
  return ((value as { name?: string } | null)?.name ?? "Institute");
}

export default async function PublicWebinarsPage({ searchParams }: { searchParams: Promise<{ mode?: string; timeline?: string }> }) {
  const { mode, timeline } = await searchParams;
  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;

  let query = dataClient
    .from("webinars")
    .select("id,title,starts_at,timezone,webinar_mode,price,currency,thumbnail_url,status,institutes(name)")
    .eq("approval_status", "approved")
    .in("status", ["scheduled", "live"])
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);

  if (mode === "free" || mode === "paid") query = query.eq("webinar_mode", mode);
  if (timeline === "upcoming") query = query.gte("starts_at", new Date().toISOString());
  if (timeline === "completed") query = query.lt("starts_at", new Date().toISOString());

  const [{ data: webinars }, { data: featuredRows }] = await Promise.all([
    query.order("starts_at", { ascending: true }),
    dataClient.from("active_featured_webinars").select("webinar_id"),
  ]);

  const featuredWebinarIds = new Set(
    ((featuredRows ?? []) as Array<{ webinar_id: string | null }>)
      .map((item) => item.webinar_id)
      .filter((item): item is string => typeof item === "string" && item.length > 0),
  );

  const rankedWebinars = [...(webinars ?? [])].sort((left, right) => Number(featuredWebinarIds.has(right.id)) - Number(featuredWebinarIds.has(left.id)));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Live Webinars</h1>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/webinars" className="rounded border px-3 py-1.5">All</Link>
        <Link href="/webinars?mode=free" className="rounded border px-3 py-1.5">Free</Link>
        <Link href="/webinars?mode=paid" className="rounded border px-3 py-1.5">Paid</Link>
        <Link href="/webinars?timeline=upcoming" className="rounded border px-3 py-1.5">Upcoming</Link>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rankedWebinars.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-xl border bg-white">
            {item.thumbnail_url ? <img src={item.thumbnail_url} alt={item.title} className="h-40 w-full object-cover" /> : null}
            <div className="p-4">
              <div className="flex items-center gap-2">
                <p className="font-semibold">{item.title}</p>
                {featuredWebinarIds.has(item.id) ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Featured</span> : null}
              </div>
              <p className="text-sm text-slate-600">{instituteName(item.institutes)} · {toDateTimeLabel(item.starts_at)}</p>
              <p className="mt-1 text-sm text-slate-600">{item.webinar_mode === "paid" ? toCurrency(Number(item.price), item.currency) : "Free"}</p>
              <Link href={`/webinars/${item.id}`} className="mt-3 inline-flex rounded border px-3 py-1.5 text-sm">View details</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
