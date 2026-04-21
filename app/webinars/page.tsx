import Link from "next/link";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { expireWebinarFeaturedSubscriptionsSafe } from "@/lib/webinar-featured";
import { toCurrency, toDateTimeLabel } from "@/lib/webinars/utils";

type SearchParams = {
  mode?: string;
  timeline?: string;
  q?: string;
};

type WebinarRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  webinar_mode: "free" | "paid";
  price: number | null;
  currency: string | null;
  thumbnail_url: string | null;
  banner_url: string | null;
  faculty_name: string | null;
  institutes: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function instituteName(value: WebinarRow["institutes"]) {
  if (Array.isArray(value)) return value[0]?.name ?? "Institute";
  return value?.name ?? "Institute";
}

function trimText(value: string | null, max = 120) {
  if (!value) return "No description added yet.";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export default async function PublicWebinarsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { mode, timeline, q } = await searchParams;
  const admin = getSupabaseAdmin();
  const supabase = await createClient();
  const dataClient = admin.ok ? admin.data : supabase;
  if (admin.ok) {
    await expireWebinarFeaturedSubscriptionsSafe(admin.data);
  }

  const nowIso = new Date().toISOString();

  let query = dataClient
    .from("webinars")
    .select("id,title,description,starts_at,ends_at,timezone,webinar_mode,price,currency,thumbnail_url,banner_url,faculty_name,institutes(name)")
    .eq("approval_status", "approved")
    .eq("is_public", true)
    .eq("is_deleted", false)
    .in("status", ["scheduled", "live"])
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`);

  if (mode === "free" || mode === "paid") query = query.eq("webinar_mode", mode);
  if (timeline === "upcoming") query = query.gte("starts_at", nowIso);
  if (q && q.trim().length > 0) query = query.ilike("title", `%${q.trim()}%`);

  const [{ data: webinars }, { data: featuredRows }] = await Promise.all([
    query.order("starts_at", { ascending: true }),
    dataClient.from("active_featured_webinars").select("webinar_id"),
  ]);

  const featuredWebinarIds = new Set(
    ((featuredRows ?? []) as Array<{ webinar_id: string | null }>)
      .map((item) => item.webinar_id)
      .filter((item): item is string => typeof item === "string" && item.length > 0),
  );

  const rankedWebinars = [...((webinars ?? []) as WebinarRow[])].sort((left, right) => {
    const featuredSort = Number(featuredWebinarIds.has(right.id)) - Number(featuredWebinarIds.has(left.id));
    if (featuredSort !== 0) return featuredSort;
    return new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime();
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-semibold">Webinars</h1>
      <p className="mt-2 text-sm text-slate-600">Discover approved public webinars from institutes and enroll in free or paid sessions.</p>

      <form className="mt-4 flex flex-col gap-2 sm:flex-row" action="/webinars" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search webinars by title"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
        />
        <input type="hidden" name="mode" value={mode === "free" || mode === "paid" ? mode : ""} />
        <input type="hidden" name="timeline" value={timeline === "upcoming" ? "upcoming" : ""} />
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">Search</button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/webinars" className="rounded border px-3 py-1.5">All</Link>
        <Link href="/webinars?mode=free" className="rounded border px-3 py-1.5">Free</Link>
        <Link href="/webinars?mode=paid" className="rounded border px-3 py-1.5">Paid</Link>
        <Link href="/webinars?timeline=upcoming" className="rounded border px-3 py-1.5">Upcoming</Link>
      </div>

      {rankedWebinars.length === 0 ? (
        <div className="mt-6 rounded-xl border bg-white p-6 text-sm text-slate-600">
          No public webinars are available right now. Please check back soon.
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rankedWebinars.map((item) => {
          const imageUrl = item.thumbnail_url ?? item.banner_url;
          return (
            <article key={item.id} className="overflow-hidden rounded-xl border bg-white">
              {imageUrl ? <img src={imageUrl} alt={item.title} className="h-40 w-full object-cover" /> : null}
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{item.title}</p>
                  {featuredWebinarIds.has(item.id) ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Featured</span> : null}
                </div>
                <p className="mt-1 text-sm text-slate-600">{instituteName(item.institutes)}</p>
                <p className="text-sm text-slate-600">Starts: {toDateTimeLabel(item.starts_at)}</p>
                <p className="text-sm text-slate-600">Ends: {toDateTimeLabel(item.ends_at)}</p>
                <p className="text-sm text-slate-600">Timezone: {item.timezone ?? "Asia/Kolkata"}</p>
                <p className="mt-1 text-sm text-slate-700">{item.webinar_mode === "paid" ? toCurrency(Number(item.price ?? 0), item.currency ?? "INR") : "Free"}</p>
                {item.faculty_name ? <p className="mt-1 text-xs text-slate-500">Faculty: {item.faculty_name}</p> : null}
                <p className="mt-2 text-sm text-slate-600">{trimText(item.description)}</p>
                <Link href={`/webinars/${item.id}`} className="mt-3 inline-flex rounded border px-3 py-1.5 text-sm">View details</Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
