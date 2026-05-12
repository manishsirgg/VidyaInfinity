/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PsychometricAdminCard,
  PsychometricEmptyState,
  PsychometricStatusBadge,
} from "@/app/admin/psychometric/_components/AdminPsychometricUI";

const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");

type Band = { label: string; min: number; max: number };

export default function TestForm({ initial, testId }: { initial?: Record<string, any>; testId?: string }) {
  const router = useRouter();
  const [manualSlug, setManualSlug] = useState(Boolean(initial?.slug));
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rawConfig, setRawConfig] = useState(JSON.stringify(initial?.scoring_config || { bands: [] }, null, 2));
  const [rawMeta, setRawMeta] = useState(JSON.stringify(initial?.metadata || {}, null, 2));

  const [form, setForm] = useState<any>({
    title: "",
    slug: "",
    description: "",
    category: "",
    price: 0,
    duration_minutes: 60,
    instructions: "",
    is_active: true,
    is_featured: false,
    scoring_config: { bands: [] },
    metadata: {},
    ...initial,
  });

  const effectiveSlug = useMemo(() => (manualSlug ? form.slug : slugify(form.title || "")), [manualSlug, form.slug, form.title]);
  const bands: Band[] = Array.isArray(form?.scoring_config?.bands) ? form.scoring_config.bands : [];

  const setField = (field: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };
  const bannerImageUrl = typeof form?.metadata?.banner_image_url === "string" ? form.metadata.banner_image_url : "";
  const setBannerImageUrl = (value: string) => {
    setForm((prev: any) => ({
      ...prev,
      metadata: {
        ...(prev?.metadata ?? {}),
        banner_image_url: value,
      },
    }));
    setErrors((prev) => ({ ...prev, banner_image_url: "" }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.title?.trim()) next.title = "Title is required.";
    if (!effectiveSlug?.trim()) next.slug = "Slug is required.";
    if (Number(form.price) < 0 || Number.isNaN(Number(form.price))) next.price = "Price must be 0 or higher.";
    if (Number(form.duration_minutes) <= 0 || Number.isNaN(Number(form.duration_minutes))) next.duration_minutes = "Duration must be greater than 0.";
    if (bannerImageUrl && !/^https?:\/\/\S+/i.test(bannerImageUrl.trim())) next.banner_image_url = "Banner image must be a valid http(s) URL.";

    for (let i = 0; i < bands.length; i++) {
      const band = bands[i];
      if (!band.label?.trim()) next[`band_${i}_label`] = "Band label is required.";
      if (Number.isNaN(Number(band.min)) || Number.isNaN(Number(band.max))) next[`band_${i}_range`] = "Min and max must be numeric.";
      if (Number(band.min) > Number(band.max)) next[`band_${i}_range`] = "Min must be <= max.";
      if (Number(band.min) < 0 || Number(band.max) > 100) next[`band_${i}_range`] = "Band range must be between 0 and 100.";
    }

    const sortedBands = [...bands].map((b, i) => ({ ...b, idx: i })).sort((a, b) => a.min - b.min);
    for (let i = 1; i < sortedBands.length; i++) {
      if (sortedBands[i].min <= sortedBands[i - 1].max) {
        next[`band_${sortedBands[i].idx}_range`] = "Band overlaps with another range.";
      }
    }

    try {
      JSON.parse(rawMeta || "{}");
    } catch {
      next.metadata = "Metadata JSON is invalid.";
    }
    try {
      JSON.parse(rawConfig || "{}");
    } catch {
      next.scoring_config_raw = "Raw scoring config JSON is invalid.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  async function save() {
    setBanner(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        slug: effectiveSlug,
        scoring_config: { ...(JSON.parse(rawConfig || "{}") || {}), bands },
        metadata: JSON.parse(rawMeta || "{}"),
      };
      const url = testId ? `/api/admin/psychometric/tests/${testId}` : "/api/admin/psychometric/tests";
      const method = testId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setBanner({ kind: "success", message: `Test ${testId ? "updated" : "created"} successfully.` });
      const id = json.data.id;
      router.push(`/admin/psychometric/tests/${id}/questions`);
    } catch (e) {
      setBanner({ kind: "error", message: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-5 pb-10">
    {banner && <div className={`rounded-xl border p-3 text-sm ${banner.kind === "success" ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>{banner.message}</div>}

    {testId && <div className="flex flex-wrap gap-2 text-sm"><Link href={`/admin/psychometric/tests/${testId}/questions`} className="rounded-lg border px-3 py-1.5 hover:bg-slate-50">Manage Questions</Link><Link href={`/psychometric-tests/${effectiveSlug}`} className="rounded-lg border px-3 py-1.5 hover:bg-slate-50">Preview Public Page</Link><Link href="/admin/psychometric/tests" className="rounded-lg border px-3 py-1.5 hover:bg-slate-50">Back to Tests</Link></div>}

    <PsychometricAdminCard className="space-y-4"><h2 className="text-lg font-semibold">Basic Details</h2><p className="text-sm text-slate-600">Use clear metadata so this test is easier to discover and manage.</p>
      <input className="w-full rounded-lg border p-2.5" placeholder="Title" value={form.title || ""} onChange={(e) => setField("title", e.target.value)} />
      {errors.title && <p className="text-xs text-rose-600">{errors.title}</p>}
      <input className="w-full rounded-lg border p-2.5" placeholder="Slug" value={effectiveSlug} onChange={(e) => { setManualSlug(true); setField("slug", e.target.value); }} />
      {errors.slug && <p className="text-xs text-rose-600">{errors.slug}</p>}
      <input className="w-full rounded-lg border p-2.5" placeholder="Category" value={form.category || ""} onChange={(e) => setField("category", e.target.value)} />
      <textarea className="w-full rounded-lg border p-2.5" placeholder="Description" value={form.description || ""} onChange={(e) => setField("description", e.target.value)} />
      <input className="w-full rounded-lg border p-2.5" placeholder="Banner image URL (optional)" value={bannerImageUrl} onChange={(e) => setBannerImageUrl(e.target.value)} />
      {errors.banner_image_url && <p className="text-xs text-rose-600">{errors.banner_image_url}</p>}
    </PsychometricAdminCard>

    <PsychometricAdminCard className="space-y-4"><h2 className="text-lg font-semibold">Pricing & Visibility</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><input className="w-full rounded-lg border p-2.5" type="number" placeholder="Price" value={form.price ?? 0} onChange={(e) => setField("price", Number(e.target.value))} /><input className="w-full rounded-lg border p-2.5" type="number" placeholder="Duration (minutes)" value={form.duration_minutes ?? 60} onChange={(e) => setField("duration_minutes", Number(e.target.value))} /></div>
      {(errors.price || errors.duration_minutes) && <p className="text-xs text-rose-600">{errors.price || errors.duration_minutes}</p>}
      <div className="flex flex-wrap gap-4"><label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={!!form.is_active} onChange={(e) => setField("is_active", e.target.checked)} /> Active</label><label className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={!!form.is_featured} onChange={(e) => setField("is_featured", e.target.checked)} /> Featured</label></div>
    </PsychometricAdminCard>

    <PsychometricAdminCard className="space-y-3"><h2 className="text-lg font-semibold">Student Instructions</h2><p className="text-sm text-slate-600">These instructions appear before the student begins the assessment.</p><textarea className="w-full rounded-lg border p-2.5" rows={4} placeholder="Instructions" value={form.instructions || ""} onChange={(e) => setField("instructions", e.target.value)} /></PsychometricAdminCard>

    <PsychometricAdminCard className="space-y-4"><h2 className="text-lg font-semibold">Scoring Configuration</h2>
      {bands.length === 0 ? <PsychometricEmptyState title="No result bands" subtitle="Add one or more score bands." /> : bands.map((b, i) => <div key={`${b.label}-${i}`} className="rounded-lg border p-3"><div className="grid grid-cols-1 gap-2 md:grid-cols-4"><input className="rounded border p-2" placeholder="Label" value={b.label} onChange={(e)=>setField("scoring_config",{...form.scoring_config,bands:bands.map((x,j)=>j===i?{...x,label:e.target.value}:x)})}/><input className="rounded border p-2" type="number" placeholder="Min" value={b.min} onChange={(e)=>setField("scoring_config",{...form.scoring_config,bands:bands.map((x,j)=>j===i?{...x,min:Number(e.target.value)}:x)})}/><input className="rounded border p-2" type="number" placeholder="Max" value={b.max} onChange={(e)=>setField("scoring_config",{...form.scoring_config,bands:bands.map((x,j)=>j===i?{...x,max:Number(e.target.value)}:x)})}/><button className="rounded-lg border px-3 hover:bg-slate-50" onClick={()=>setField("scoring_config",{...form.scoring_config,bands:bands.filter((_,j)=>j!==i)})}>Remove</button></div>
      {(errors[`band_${i}_label`] || errors[`band_${i}_range`]) && <p className="mt-1 text-xs text-rose-600">{errors[`band_${i}_label`] || errors[`band_${i}_range`]}</p>}
      </div>)}
      <button className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50" onClick={()=>setField("scoring_config",{...form.scoring_config,bands:[...bands,{label:"",min:0,max:0}]})}>Add Band</button>
      <div className="text-xs"><PsychometricStatusBadge label="Validation checks overlap and 0-100 bounds" tone="amber" /></div>
    </PsychometricAdminCard>

    <PsychometricAdminCard className="space-y-3"><h2 className="text-lg font-semibold">Advanced JSON</h2><p className="text-sm text-slate-600">For power users: directly modify metadata and config objects.</p>
      <textarea className="w-full rounded border p-2 font-mono text-xs" rows={6} value={rawMeta} onChange={(e)=>setRawMeta(e.target.value)} />{errors.metadata && <p className="text-xs text-rose-600">{errors.metadata}</p>}
      <textarea className="w-full rounded border p-2 font-mono text-xs" rows={6} value={rawConfig} onChange={(e)=>setRawConfig(e.target.value)} />{errors.scoring_config_raw && <p className="text-xs text-rose-600">{errors.scoring_config_raw}</p>}
    </PsychometricAdminCard>

    <div className="sticky bottom-3 z-10 rounded-xl border bg-white/95 p-3 shadow-sm backdrop-blur"><button onClick={save} disabled={saving} className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white disabled:opacity-50 md:w-auto">{saving ? "Saving..." : "Save Test"}</button></div>
  </div>;
}
