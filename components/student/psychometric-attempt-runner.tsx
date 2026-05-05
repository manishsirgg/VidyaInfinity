"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Q = {id:string;question_text:string;question_type:string;is_required:boolean;min_scale_value:number|null;max_scale_value:number|null;options:{id:string;option_label:string}[]};

export function PsychometricAttemptRunner({attemptId,questions,initial}:{attemptId:string;questions:Q[];initial:Record<string,unknown>}) {
  const [answers,setAnswers]=useState<Record<string,unknown>>(initial);
  const [msg,setMsg]=useState("");
  const [saving,setSaving]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [missing,setMissing]=useState<string[]>([]);
  const router=useRouter();

  const isAnswered = (q:Q) => {
    const v=answers[q.id];
    if (Array.isArray(v)) return v.length>0;
    return Boolean(String(v??"").trim());
  };
  const answered=useMemo(()=>questions.filter((q)=>{const v=answers[q.id]; if (Array.isArray(v)) return v.length>0; return Boolean(String(v??"" ).trim());}).length,[answers,questions]);

  useEffect(()=>{const beforeUnload=(e:BeforeUnloadEvent)=>{if(dirty||saving){e.preventDefault(); e.returnValue="";}}; window.addEventListener("beforeunload",beforeUnload); return ()=>window.removeEventListener("beforeunload",beforeUnload);},[dirty,saving]);

  const save=async(q:Q,v:unknown)=>{setSaving(true);setDirty(true);setAnswers(p=>({...p,[q.id]:v})); const body: Record<string, unknown> = { questionId: q.id }; if(q.question_type==="single_choice") body.optionId=v; if(q.question_type==="multiple_choice") body.selectedValues=v; if(q.question_type==="scale"||q.question_type==="numeric") body.numericValue=Number(v); if(q.question_type==="text") body.answerText=String(v??""); const r=await fetch(`/api/psychometric/attempts/${attemptId}/answers`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); const b=await r.json(); setSaving(false); if (r.ok) { setDirty(false); setMsg("All changes saved"); } else setMsg(b.error??"Save failed");};
  const submit=async()=>{ const missingNow=questions.filter((q)=>q.is_required&&!isAnswered(q)).map((q)=>q.id); setMissing(missingNow); if(missingNow.length){ setMsg(`Please answer ${missingNow.length} required question(s).`); return; } setSubmitting(true); const r=await fetch(`/api/psychometric/attempts/${attemptId}/submit`,{method:"POST"}); const b=await r.json(); setSubmitting(false); if(!r.ok){setMsg(b.error??"Submit failed"); return;} router.push(b.redirectTo);};

  return <div className="space-y-4"><div className="rounded-lg border bg-white p-3 text-sm">Progress: {answered}/{questions.length} · {saving?"Autosaving…":dirty?"Unsaved changes":"Saved"}</div>{questions.map((q,i)=><div key={q.id} className={`rounded-lg border bg-white p-4 ${missing.includes(q.id)?"border-rose-400":""}`}><p className="font-medium">{i+1}. {q.question_text} {q.is_required?<span className="text-rose-600" title="Required">*</span>:null}</p>{missing.includes(q.id)?<p className="mt-1 text-xs text-rose-600">Required question.</p>:null}{q.question_type==="single_choice"&&q.options.map(o=><label key={o.id} className="block text-sm"><input className="mr-2" type="radio" checked={answers[q.id]===o.id} onChange={()=>save(q,o.id)}/>{o.option_label}</label>)}{q.question_type==="multiple_choice"&&q.options.map(o=>{const cur=Array.isArray(answers[q.id])?answers[q.id] as string[]:[]; return <label key={o.id} className="block text-sm"><input className="mr-2" type="checkbox" checked={cur.includes(o.id)} onChange={(e)=>save(q,e.target.checked?[...cur,o.id]:cur.filter(x=>x!==o.id))}/>{o.option_label}</label>})}{q.question_type==="scale"?<input type="range" min={q.min_scale_value??1} max={q.max_scale_value??5} value={Number(answers[q.id]??q.min_scale_value??1)} onChange={(e)=>save(q,e.target.value)} />:null}{q.question_type==="numeric"?<input className="mt-2 w-full rounded border p-2" type="number" value={String(answers[q.id]??"")} onChange={(e)=>save(q,e.target.value)} />:null}{q.question_type==="text"?<textarea className="mt-2 w-full rounded border p-2" value={String(answers[q.id]??"")} onChange={(e)=>save(q,e.target.value)} />:null}</div>)}<button disabled={submitting} onClick={submit} className="rounded bg-brand-600 px-4 py-2 text-white disabled:opacity-60">{submitting?"Submitting…":"Submit test"}</button>{msg?<p className="text-sm text-slate-600">{msg}</p>:null}</div>;
}
