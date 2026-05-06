/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");

export default function TestForm({ initial, testId }: { initial?: Record<string, any>; testId?: string }) {
  const router = useRouter();
  const [manualSlug, setManualSlug] = useState(Boolean(initial?.slug));
  const [form, setForm] = useState<any>({ title:"", slug:"", description:"", category:"", price:0, duration_minutes:60, instructions:"", is_active:true, is_featured:false, scoring_config:{bands:[]}, metadata:{}, ...initial });
  const effectiveSlug = useMemo(() => manualSlug ? form.slug : slugify(form.title || ""), [manualSlug, form.slug, form.title]);
  async function save() {
    if (!form.title?.trim()) return alert("Title required");
    if (Number(form.price) < 0) return alert("Price must be >= 0");
    const payload = { ...form, slug: effectiveSlug };
    const url = testId ? `/api/admin/psychometric/tests/${testId}` : "/api/admin/psychometric/tests";
    const method = testId ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: {"content-type":"application/json"}, body: JSON.stringify(payload) });
    const json = await res.json(); if (!res.ok) return alert(json.error || "Save failed");
    const id = json.data.id; router.push(`/admin/psychometric/tests/${id}/questions`);
  }
  return <div className="space-y-3"><input className="w-full rounded border p-2" placeholder="Title" value={form.title||""} onChange={e=>setForm({...form,title:e.target.value})}/>
  <input className="w-full rounded border p-2" placeholder="Slug" value={effectiveSlug} onChange={e=>{setManualSlug(true);setForm({...form,slug:e.target.value});}}/>
  <textarea className="w-full rounded border p-2" placeholder="Description" value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/>
  <input className="w-full rounded border p-2" placeholder="Category" value={form.category||""} onChange={e=>setForm({...form,category:e.target.value})}/>
  <input className="w-full rounded border p-2" type="number" placeholder="Price" value={form.price??0} onChange={e=>setForm({...form,price:Number(e.target.value)})}/>
  <input className="w-full rounded border p-2" type="number" placeholder="Duration" value={form.duration_minutes??60} onChange={e=>setForm({...form,duration_minutes:Number(e.target.value)})}/>
  <textarea className="w-full rounded border p-2" placeholder="Instructions" value={form.instructions||""} onChange={e=>setForm({...form,instructions:e.target.value})}/>
  <textarea className="w-full rounded border p-2" placeholder='Scoring config JSON ({"bands":[]})' value={JSON.stringify(form.scoring_config||{},null,2)} onChange={e=>setForm({...form,scoring_config:JSON.parse(e.target.value||"{}")})}/>
  <textarea className="w-full rounded border p-2" placeholder="Metadata JSON" value={JSON.stringify(form.metadata||{},null,2)} onChange={e=>setForm({...form,metadata:JSON.parse(e.target.value||"{}")})}/>
  <label><input type="checkbox" checked={!!form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Active</label>
  <label className="ml-4"><input type="checkbox" checked={!!form.is_featured} onChange={e=>setForm({...form,is_featured:e.target.checked})}/> Featured</label>
  <div><button onClick={save} className="rounded bg-brand-600 px-3 py-2 text-white">Save</button></div></div>;
}
