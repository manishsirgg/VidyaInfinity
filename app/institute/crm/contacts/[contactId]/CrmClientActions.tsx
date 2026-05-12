"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

function useSubmit() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (url: string, method: string, body: unknown) => {
    setLoading(true); setError(null); setMessage(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Request failed");
      setMessage("Saved successfully");
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      return false;
    } finally { setLoading(false); }
  };

  return { loading, message, error, setMessage, submit };
}

export function AddNoteForm({ contactId }: { contactId: string }) {
  const { loading, message, error, submit } = useSubmit();
  const [note, setNote] = useState("");
  const [type, setType] = useState("general");
  const [pinned, setPinned] = useState(false);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await submit(`/api/institute/crm/contacts/${contactId}/notes`, "POST", { note, note_type: type, is_pinned: pinned });
    if (ok) { setNote(""); setPinned(false); }
  };
  return <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-slate-200 p-3">
    <h3 className="font-semibold">Add Note</h3>
    <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded border px-2 py-1"><option>general</option><option>call</option><option>email</option><option>meeting</option><option>internal</option></select>
    <textarea required value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded border px-2 py-1" rows={3} />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin note</label>
    <button disabled={loading} className="rounded bg-slate-900 px-3 py-1 text-white disabled:opacity-60">{loading ? "Saving..." : "Add Note"}</button>
    {error ? <p className="text-sm text-red-600">{error}</p> : null}{message ? <p className="text-sm text-green-600">{message}</p> : null}
  </form>;
}

export function AddFollowUpForm({ contactId }: { contactId: string }) {
  const { loading, message, error, submit } = useSubmit();
  const [dueAt, setDueAt] = useState(""); const [channel, setChannel] = useState("call"); const [purpose, setPurpose] = useState(""); const [notes, setNotes] = useState("");
  const onSubmit = (e: FormEvent) => { e.preventDefault(); submit(`/api/institute/crm/contacts/${contactId}/follow-ups`, "POST", { due_at: new Date(dueAt).toISOString(), channel, purpose, notes: notes || null }); };
  return <form onSubmit={onSubmit} className="space-y-2 rounded-xl border border-slate-200 p-3"><h3 className="font-semibold">Schedule Follow-up</h3>
    <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full rounded border px-2 py-1"><option>call</option><option>email</option><option>whatsapp</option><option>sms</option><option>meeting</option><option>other</option></select>
    <input required value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Purpose" className="w-full rounded border px-2 py-1" />
    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="w-full rounded border px-2 py-1" />
    <input type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full rounded border px-2 py-1" />
    <button disabled={loading} className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-60">{loading ? "Saving..." : "Schedule"}</button>
    {error ? <p className="text-sm text-red-600">{error}</p> : null}{message ? <p className="text-sm text-green-600">{message}</p> : null}
  </form>;
}

export function StagePriorityForm({ contactId, lifecycleStage, priority, nextFollowUpAt }: { contactId: string; lifecycleStage?: string | null; priority?: string | null; nextFollowUpAt?: string | null }) {
  const { loading, message, error, submit } = useSubmit();
  const [stage, setStage] = useState(lifecycleStage ?? "new");
  const [prio, setPrio] = useState(priority ?? "medium");
  const [nextAt, setNextAt] = useState(nextFollowUpAt ? new Date(nextFollowUpAt).toISOString().slice(0, 16) : "");
  const [lostReason, setLostReason] = useState("");

  return <div className="space-y-2 rounded-xl border border-slate-200 p-3"><h3 className="font-semibold">Quick Actions</h3>
    <form onSubmit={(e) => { e.preventDefault(); submit(`/api/institute/crm/contacts/${contactId}`, "PATCH", { lifecycle_stage: stage, priority: prio, next_follow_up_at: nextAt ? new Date(nextAt).toISOString() : null }); }} className="space-y-2">
      <select value={stage} onChange={(e) => setStage(e.target.value)} className="w-full rounded border px-2 py-1"><option>new</option><option>contacted</option><option>qualified</option><option>converted</option><option>lost</option></select>
      <select value={prio} onChange={(e) => setPrio(e.target.value)} className="w-full rounded border px-2 py-1"><option>low</option><option>medium</option><option>high</option><option>urgent</option></select>
      <input type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} className="w-full rounded border px-2 py-1" />
      <button disabled={loading} className="rounded bg-slate-900 px-3 py-1 text-white">Save Update</button>
    </form>
    <div className="grid grid-cols-2 gap-2 text-sm">
      <button onClick={() => submit(`/api/institute/crm/contacts/${contactId}`, "PATCH", { lifecycle_stage: "contacted" })} className="rounded border px-2 py-1">Mark Contacted</button>
      <button onClick={() => submit(`/api/institute/crm/contacts/${contactId}`, "PATCH", { lifecycle_stage: "qualified" })} className="rounded border px-2 py-1">Mark Qualified</button>
      <button onClick={() => submit(`/api/institute/crm/contacts/${contactId}`, "PATCH", { lifecycle_stage: "converted", converted: true, converted_at: new Date().toISOString() })} className="rounded border px-2 py-1">Mark Converted</button>
      <button onClick={() => { if (!lostReason.trim()) return; submit(`/api/institute/crm/contacts/${contactId}`, "PATCH", { lifecycle_stage: "lost", converted: false, lost_reason: lostReason }); }} className="rounded border px-2 py-1">Mark Lost</button>
      <button onClick={() => window.confirm("Archive this contact?") && submit(`/api/institute/crm/contacts/${contactId}`, "PATCH", { is_archived: true })} className="col-span-2 rounded border border-red-300 px-2 py-1 text-red-700">Archive Contact</button>
    </div>
    <textarea value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Lost reason (required for Mark Lost)" className="w-full rounded border px-2 py-1" rows={2} />
    {error ? <p className="text-sm text-red-600">{error}</p> : null}{message ? <p className="text-sm text-green-600">{message}</p> : null}
  </div>;
}

export function FollowUpActions({ followUpId, status }: { followUpId: string; status: string | null }) {
  const { loading, error, submit } = useSubmit();
  if (status !== "pending") return null;
  return <div className="mt-2 flex gap-2 text-xs">
    <button disabled={loading} onClick={() => submit(`/api/institute/crm/follow-ups/${followUpId}`, "PATCH", { status: "completed", completed_at: new Date().toISOString() })} className="rounded border px-2 py-1">Mark completed</button>
    <button disabled={loading} onClick={() => submit(`/api/institute/crm/follow-ups/${followUpId}`, "PATCH", { status: "cancelled", cancelled_at: new Date().toISOString() })} className="rounded border px-2 py-1">Cancel</button>
    {error ? <span className="text-red-600">{error}</span> : null}
  </div>;
}
