"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PsychometricAdminCard, PsychometricAdminHeader, PsychometricEmptyState, PsychometricStatusBadge } from "@/app/admin/psychometric/_components/AdminPsychometricUI";

type QuestionType = "single_choice" | "multiple_choice" | "scale" | "numeric" | "text";
type Option = { id?: string; option_text: string; option_value?: string | null; score_value: number; sort_order: number; is_active: boolean };
type Question = { id: string; question_text: string; question_type: QuestionType; is_required: boolean; weight: number; sort_order: number; is_active: boolean; min_scale_value?: number | null; max_scale_value?: number | null; metadata?: Record<string, unknown> | null; psychometric_question_options?: Option[] };
const QUESTION_TYPES: QuestionType[] = ["single_choice", "multiple_choice", "scale", "numeric", "text"];
const isChoice = (t: QuestionType) => t === "single_choice" || t === "multiple_choice";

export default function QuestionBuilderPage({ testTitle = "Psychometric Test" }: { testTitle?: string }) {
  const { testId } = useParams<{ testId: string }>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [draft, setDraft] = useState<Question & { psychometric_question_options: Option[] }>({ id: "draft", question_text: "", question_type: "single_choice", is_required: true, weight: 1, sort_order: 1, is_active: true, min_scale_value: 1, max_scale_value: 5, metadata: { help_text: "", placeholder: "" }, psychometric_question_options: [{ option_text: "", option_value: "", score_value: 0, sort_order: 1, is_active: true }, { option_text: "", option_value: "", score_value: 0, sort_order: 2, is_active: true }] });

  const load = useCallback(async () => { setLoading(true); try { const r = await fetch(`/api/admin/psychometric/tests/${testId}/questions`); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Failed to load questions"); const sorted = (j.data || []).sort((a: Question, b: Question) => (a.sort_order ?? 0) - (b.sort_order ?? 0)); setQuestions(sorted); setSelectedQuestionId((c) => c ?? sorted[0]?.id ?? null); } catch (e) { setBanner({ kind: "error", message: e instanceof Error ? e.message : "Load failed" }); } finally { setLoading(false); } }, [testId]);
  useEffect(() => { void load(); }, [load]);
  const selectedQuestion = useMemo(() => questions.find((q) => q.id === selectedQuestionId) ?? null, [questions, selectedQuestionId]);

  const validate = (q: Question & { psychometric_question_options?: Option[] }) => {
    if (!q.question_text.trim()) return "question_text is required.";
    if (q.question_type === "scale" && !(Number(q.min_scale_value) < Number(q.max_scale_value))) return "Scale requires min < max.";
    if (isChoice(q.question_type)) {
      const active = (q.psychometric_question_options || []).filter((o) => o.is_active);
      if (active.length < 2) return "Choice questions require at least 2 active options.";
      for (const o of active) { if (!o.option_text.trim()) return "option_text is required for active options."; if (Number.isNaN(Number(o.score_value))) return "score_value must be numeric."; }
    }
    return null;
  };

  const saveQuestion = async (target: "create" | "edit") => {
    const model = target === "create" ? draft : selectedQuestion;
    if (!model) return;
    const e = validate(model);
    if (e) return setBanner({ kind: "error", message: e });
    setSaving(true);
    try {
      if (target === "create") {
        const payload = { ...draft, options: isChoice(draft.question_type) ? draft.psychometric_question_options : [] };
        const r = await fetch(`/api/admin/psychometric/tests/${testId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Create failed");
      } else {
        const current = model;
        const r = await fetch(`/api/admin/psychometric/questions/${current.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(current) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Update failed");
      }
      await load();
      setBanner({ kind: "success", message: target === "create" ? "Question created." : "Question updated." });
    } catch (er) {
      setBanner({ kind: "error", message: er instanceof Error ? er.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const optionWarning = (q: Question | null) => !!q && isChoice(q.question_type) && (q.psychometric_question_options || []).filter((o) => o.is_active).length < 2;
  const updateSelected = (next: Partial<Question>) => setQuestions((arr) => arr.map((q) => (q.id === selectedQuestionId ? { ...q, ...next } : q)));

  return <div className="space-y-4 p-2 md:p-4">
    <PsychometricAdminHeader title="Question Builder" description="Create and manage psychometric questions." breadcrumbs={[{ label: "Tests", href: "/admin/psychometric/tests" }, { label: testTitle }, { label: "Questions" }]} action={<Link href="/admin/psychometric/tests" className="rounded-lg border px-3 py-2 text-sm">Back to Tests</Link>} />
    {banner && <div className={`rounded-xl border p-3 text-sm ${banner.kind === "success" ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>{banner.message}</div>}
    {!loading && questions.filter((q) => q.is_active).length === 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">Warning: this test has no active questions.</div>}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <PsychometricAdminCard className="space-y-2 lg:col-span-1"><h2 className="font-semibold">Question List</h2>
        {loading ? <div className="text-sm text-slate-500">Loading questions...</div> : questions.length === 0 ? <PsychometricEmptyState title="No questions yet" subtitle="Create your first question from the editor panel." /> : questions.map((q, idx) => <div key={q.id} className={`rounded border p-2 ${selectedQuestionId === q.id ? "border-brand-600" : ""}`}><div className="flex items-center justify-between"><button className="text-left text-sm font-medium" onClick={() => setSelectedQuestionId(q.id)}>{idx + 1}. {q.question_text.slice(0, 54) || "Untitled question"}</button><span className="text-xs">#{q.sort_order}</span></div><div className="mt-1 flex flex-wrap gap-1 text-xs"><PsychometricStatusBadge label={q.question_type} tone="blue" /><PsychometricStatusBadge label={q.is_required ? "Required" : "Optional"} tone={q.is_required ? "emerald" : "slate"} /><PsychometricStatusBadge label={q.is_active ? "Active" : "Inactive"} tone={q.is_active ? "emerald" : "amber"} /></div><div className="mt-2 flex gap-2 text-xs"><button className="rounded border px-2 py-1" onClick={async()=>{if(!confirm("Duplicate this question?")) return; const r=await fetch(`/api/admin/psychometric/questions/${q.id}/duplicate`,{method:"POST"}); setBanner({kind:r.ok?"success":"error",message:r.ok?"Question duplicated.":"Duplicate failed."}); await load();}}>Duplicate</button><button className="rounded border px-2 py-1" onClick={async()=>{if(!confirm("Deactivate this question?")) return; const r=await fetch(`/api/admin/psychometric/questions/${q.id}`,{method:"DELETE"}); setBanner({kind:r.ok?"success":"error",message:r.ok?"Question deactivated.":"Deactivate failed."}); await load();}}>Deactivate</button></div></div>)}
      </PsychometricAdminCard>

      <div className="space-y-4 lg:col-span-2">
        <PsychometricAdminCard className="space-y-2"><h2 className="font-semibold">Create Question</h2>
          <input className="w-full rounded border p-2" placeholder="question_text" value={draft.question_text} onChange={(e) => setDraft({ ...draft, question_text: e.target.value })} />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2"><select className="rounded border p-2" value={draft.question_type} onChange={(e) => setDraft({ ...draft, question_type: e.target.value as QuestionType })}>{QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}</select><input type="number" className="rounded border p-2" value={draft.sort_order} onChange={(e)=>setDraft({...draft,sort_order:Number(e.target.value||1)})} /></div>
          <button disabled={saving} onClick={() => void saveQuestion("create")} className="rounded bg-brand-600 px-3 py-2 text-white disabled:opacity-50">{saving ? "Saving..." : "Add question"}</button>
        </PsychometricAdminCard>

        {selectedQuestion && <PsychometricAdminCard className="space-y-3"><h2 className="font-semibold">Editor + Preview</h2>
          {optionWarning(selectedQuestion) && <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">Choice questions need at least 2 active options.</div>}
          <input className="w-full rounded border p-2" value={selectedQuestion.question_text} onChange={(e) => updateSelected({ question_text: e.target.value })} />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2"><select className="rounded border p-2" value={selectedQuestion.question_type} onChange={(e)=>updateSelected({question_type:e.target.value as QuestionType})}>{QUESTION_TYPES.map((t)=><option key={t}>{t}</option>)}</select><input type="number" className="rounded border p-2" value={selectedQuestion.weight} onChange={(e)=>updateSelected({weight:Number(e.target.value||1)})} /></div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3"><input type="number" className="rounded border p-2" value={selectedQuestion.sort_order} onChange={(e)=>updateSelected({sort_order:Number(e.target.value||1)})} /><label className="text-sm"><input type="checkbox" checked={selectedQuestion.is_required} onChange={(e)=>updateSelected({is_required:e.target.checked})}/> Required</label><label className="text-sm"><input type="checkbox" checked={selectedQuestion.is_active} onChange={(e)=>updateSelected({is_active:e.target.checked})}/> Active</label></div>
          {isChoice(selectedQuestion.question_type) && <div className="space-y-2"><h3 className="font-medium">Option Editor (option_text)</h3>{(selectedQuestion.psychometric_question_options||[]).map((o,i)=><div key={o.id??i} className="grid grid-cols-1 gap-2 rounded border p-2 md:grid-cols-12"><input className="md:col-span-4 rounded border p-2" placeholder="option_text" value={o.option_text} onChange={(e)=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:(q.psychometric_question_options||[]).map((x,j)=>j===i?{...x,option_text:e.target.value}:x)}:q))}/><input className="md:col-span-3 rounded border p-2" placeholder="option_value" value={o.option_value||""} onChange={(e)=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:(q.psychometric_question_options||[]).map((x,j)=>j===i?{...x,option_value:e.target.value}:x)}:q))}/><input type="number" className="md:col-span-2 rounded border p-2" placeholder="score_value" value={o.score_value} onChange={(e)=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:(q.psychometric_question_options||[]).map((x,j)=>j===i?{...x,score_value:Number(e.target.value||0)}:x)}:q))}/><input type="number" className="md:col-span-2 rounded border p-2" placeholder="sort" value={o.sort_order} onChange={(e)=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:(q.psychometric_question_options||[]).map((x,j)=>j===i?{...x,sort_order:Number(e.target.value||1)}:x)}:q))}/><label className="md:col-span-1 text-xs"><input type="checkbox" checked={o.is_active} onChange={(e)=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:(q.psychometric_question_options||[]).map((x,j)=>j===i?{...x,is_active:e.target.checked}:x)}:q))}/> active</label></div>)}<button className="rounded border px-2 py-1 text-sm" onClick={()=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:[...(q.psychometric_question_options||[]),{option_text:"",option_value:"",score_value:0,sort_order:(q.psychometric_question_options||[]).length+1,is_active:true}]}:q))}>Add option</button></div>}
          {selectedQuestion.question_type === "scale" && <div className="grid grid-cols-2 gap-2"><input className="rounded border p-2" type="number" value={selectedQuestion.min_scale_value||1} onChange={(e)=>updateSelected({min_scale_value:Number(e.target.value||1)})} /><input className="rounded border p-2" type="number" value={selectedQuestion.max_scale_value||5} onChange={(e)=>updateSelected({max_scale_value:Number(e.target.value||5)})} /></div>}
          <div className="rounded border bg-slate-50 p-3 text-sm"><p className="mb-1 font-medium">Student Preview</p><p>{selectedQuestion.question_text || "Question text preview"}</p></div>
          <button className="rounded bg-brand-600 px-3 py-2 text-white" disabled={saving} onClick={() => void saveQuestion("edit")}>{saving ? "Saving..." : "Save changes"}</button>
        </PsychometricAdminCard>}
      </div>
    </div>
  </div>;
}
