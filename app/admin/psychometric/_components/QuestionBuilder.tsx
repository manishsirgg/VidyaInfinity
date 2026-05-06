"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type QuestionType = "single_choice" | "multiple_choice" | "scale" | "numeric" | "text";
type Option = { id?: string; option_text: string; option_value?: string | null; score_value: number; sort_order: number; is_active: boolean };
type Question = {
  id: string;
  question_text: string;
  question_type: QuestionType;
  is_required: boolean;
  weight: number;
  sort_order: number;
  is_active: boolean;
  min_scale_value?: number | null;
  max_scale_value?: number | null;
  psychometric_question_options?: Option[];
};

const QUESTION_TYPES: QuestionType[] = ["single_choice", "multiple_choice", "scale", "numeric", "text"];
const isChoice = (type: QuestionType) => type === "single_choice" || type === "multiple_choice";

export default function QuestionBuilderPage({ testTitle = "Psychometric Test" }: { testTitle?: string }) {
  const { testId } = useParams<{ testId: string }>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [draft, setDraft] = useState<Question & { psychometric_question_options: Option[] }>({
    id: "draft",
    question_text: "",
    question_type: "single_choice",
    is_required: true,
    weight: 1,
    sort_order: 1,
    is_active: true,
    min_scale_value: 1,
    max_scale_value: 5,
    psychometric_question_options: [
      { option_text: "", option_value: "", score_value: 0, sort_order: 1, is_active: true },
      { option_text: "", option_value: "", score_value: 0, sort_order: 2, is_active: true },
    ],
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/psychometric/tests/${testId}/questions`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed to load questions");
      const sorted = (j.data || []).sort((a: Question, b: Question) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setQuestions(sorted);
      if (!selectedQuestionId && sorted[0]?.id) setSelectedQuestionId(sorted[0].id);
    } catch (e) {
      setBanner({ kind: "error", message: e instanceof Error ? e.message : "Load failed" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [testId]);

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedQuestionId) ?? null,
    [questions, selectedQuestionId],
  );

  const validate = (q: Question & { psychometric_question_options?: Option[] }) => {
    if (!q.question_text.trim()) return "question_text is required.";
    if (!q.question_type) return "question_type is required.";
    if (Number.isNaN(Number(q.weight))) return "weight must be numeric.";
    if (q.question_type === "scale" && !(Number(q.min_scale_value) < Number(q.max_scale_value))) return "scale requires min < max.";
    if (isChoice(q.question_type)) {
      const active = (q.psychometric_question_options || []).filter((o) => o.is_active);
      if (active.length < 2) return "Choice questions require at least 2 active options.";
      for (const o of active) {
        if (!o.option_text.trim()) return "option_text is required for active options.";
        if (Number.isNaN(Number(o.score_value))) return "score_value must be numeric.";
      }
    }
    return null;
  };

  const resetDraft = () => setDraft((d) => ({ ...d, question_text: "", weight: 1, question_type: "single_choice", psychometric_question_options: d.psychometric_question_options.map((o, i) => ({ ...o, option_text: "", score_value: 0, sort_order: i + 1, is_active: true })) }));

  const upsertQuestion = async (target: "create" | "edit") => {
    const error = validate(target === "create" ? draft : (selectedQuestion as Question));
    if (error) return setBanner({ kind: "error", message: error });
    setSaving(true);
    try {
      if (target === "create") {
        const payload = { ...draft, weight: Number(draft.weight || 1), psychometric_question_options: undefined, options: isChoice(draft.question_type) ? draft.psychometric_question_options : [] };
        const r = await fetch(`/api/admin/psychometric/tests/${testId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Create failed");
        resetDraft();
      } else if (selectedQuestion) {
        const r = await fetch(`/api/admin/psychometric/questions/${selectedQuestion.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(selectedQuestion) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Update failed");
      }
      await load();
      setBanner({ kind: "success", message: target === "create" ? "Question created." : "Question updated." });
    } catch (e) {
      setBanner({ kind: "error", message: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-4 p-2 md:p-4">
    <div className="text-sm text-slate-600"><Link className="underline" href="/admin/psychometric/tests">Tests</Link> / <span>{testTitle}</span> / <span>Questions</span></div>
    <h1 className="text-2xl font-semibold">Admin Psychometric Question Builder</h1>
    {banner && <div className={`rounded border p-3 text-sm ${banner.kind === "success" ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>{banner.message}</div>}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-1">
        <div className="rounded border bg-white p-3">
          <h2 className="mb-2 font-medium">Question list</h2>
          {loading ? <div className="text-sm text-slate-500">Loading questions...</div> : questions.length === 0 ? <div className="text-sm text-slate-500">No questions yet. Create your first one.</div> : questions.map((q, idx) => <button key={q.id} onClick={() => setSelectedQuestionId(q.id)} className={`mb-2 w-full rounded border p-2 text-left text-sm ${selectedQuestionId === q.id ? "border-brand-600" : ""}`}><div className="font-medium">{idx + 1}. {q.question_text}</div><div className="text-xs text-slate-500">{q.question_type} • order {q.sort_order}</div></button>) }
        </div>
      </div>
      <div className="space-y-3 lg:col-span-2">
        <div className="rounded border bg-white p-3">
          <h2 className="mb-2 font-medium">Create question</h2>
          <input className="mb-2 w-full rounded border p-2" placeholder="question_text" value={draft.question_text} onChange={(e) => setDraft({ ...draft, question_text: e.target.value })} />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <select className="rounded border p-2" value={draft.question_type} onChange={(e) => setDraft({ ...draft, question_type: e.target.value as QuestionType })}>{QUESTION_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <input type="number" className="rounded border p-2" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: Number(e.target.value || 1) })} placeholder="weight" />
          </div>
          <button disabled={saving} onClick={() => void upsertQuestion("create")} className="mt-3 rounded bg-brand-600 px-3 py-2 text-white disabled:opacity-50">{saving ? "Saving..." : "Add question"}</button>
        </div>
        {selectedQuestion && <div className="rounded border bg-white p-3"><h2 className="mb-2 font-medium">Editor panel</h2><div className="space-y-2">
          <input className="w-full rounded border p-2" value={selectedQuestion.question_text} onChange={(e) => setQuestions((arr) => arr.map((q) => q.id === selectedQuestion.id ? { ...q, question_text: e.target.value } : q))} />
          <div className="grid grid-cols-2 gap-2"><input type="number" className="rounded border p-2" value={selectedQuestion.sort_order} onChange={(e) => setQuestions((arr) => arr.map((q) => q.id === selectedQuestion.id ? { ...q, sort_order: Number(e.target.value || 1) } : q))} /><button className="rounded border p-2" onClick={async()=>{await fetch('/api/admin/psychometric/questions/reorder',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({questionIds:questions.slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)).map((q)=>q.id)})}); await load();}}>Apply sort order</button></div>
          {isChoice(selectedQuestion.question_type) && <div><h3 className="font-medium">Option editor (option_text)</h3>{(selectedQuestion.psychometric_question_options||[]).map((o,i)=><div key={o.id??i} className="mt-1 grid grid-cols-12 gap-1"><input className="col-span-7 rounded border p-2" value={o.option_text} placeholder="option_text" onChange={(e)=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:(q.psychometric_question_options||[]).map((x,j)=>j===i?{...x,option_text:e.target.value}:x)}:q))}/><input type="number" className="col-span-3 rounded border p-2" value={o.score_value} onChange={(e)=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:(q.psychometric_question_options||[]).map((x,j)=>j===i?{...x,score_value:Number(e.target.value||0)}:x)}:q))}/><label className="col-span-2 text-xs"><input type="checkbox" checked={o.is_active} onChange={(e)=>setQuestions((arr)=>arr.map((q)=>q.id===selectedQuestion.id?{...q,psychometric_question_options:(q.psychometric_question_options||[]).map((x,j)=>j===i?{...x,is_active:e.target.checked}:x)}:q))}/> active</label></div>)}</div>}
          <div className="flex flex-wrap gap-2"><button className="rounded bg-brand-600 px-3 py-2 text-white" disabled={saving} onClick={() => void upsertQuestion("edit")}>Save changes</button><button className="rounded border px-3 py-2" onClick={async()=>{if(!confirm('Duplicate this question?')) return; const r=await fetch(`/api/admin/psychometric/questions/${selectedQuestion.id}/duplicate`,{method:'POST'}); if(r.ok){setBanner({kind:'success',message:'Question duplicated.'}); await load();} else setBanner({kind:'error',message:'Duplicate failed.'});}}>Duplicate</button><button className="rounded border px-3 py-2" onClick={async()=>{if(!confirm('Deactivate this question?')) return; const r=await fetch(`/api/admin/psychometric/questions/${selectedQuestion.id}`,{method:'DELETE'}); if(r.ok){setBanner({kind:'success',message:'Question deactivated.'}); await load();} else setBanner({kind:'error',message:'Deactivate failed.'});}}>Deactivate</button></div>
        </div></div>}
      </div>
    </div>
  </div>;
}
