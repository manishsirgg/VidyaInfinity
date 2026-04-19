"use client";

import { useEffect, useState } from "react";

type WebinarItem = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  webinar_mode: "free" | "paid";
  price: number;
  status: string;
  institutes?: { name?: string | null } | null;
};

export default function AdminWebinarsPage() {
  const [webinars, setWebinars] = useState<WebinarItem[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/admin/webinars", { cache: "no-store" });
      const body = await response.json();
      if (response.ok) setWebinars(body.webinars ?? []);
    }
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Webinar Control Center</h1>
      <p className="mt-2 text-sm text-slate-600">Admin view for platform webinars from all institutes, including free and paid events.</p>

      <div className="mt-6 space-y-3">
        {webinars.map((item) => (
          <article key={item.id} className="rounded-xl border bg-white p-4 text-sm">
            <p className="font-medium">{item.title}</p>
            <p className="text-slate-600">Institute: {item.institutes?.name ?? "-"}</p>
            <p className="text-slate-600">{new Date(item.starts_at).toLocaleString()} · {item.webinar_mode === "paid" ? `Paid ₹${item.price}` : "Free"}</p>
            <p className="text-slate-600">Status: {item.status}</p>
          </article>
        ))}
        {webinars.length === 0 ? <p className="text-sm text-slate-500">No webinars found.</p> : null}
      </div>
    </div>
  );
}
