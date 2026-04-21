"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type CrmContact = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  service_type: string | null;
  lifecycle_stage: string | null;
  priority: string | null;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  last_activity_at: string | null;
  created_at: string | null;
};

type ContactDetail = {
  contact: CrmContact & {
    linked_profile_id?: string | null;
    linked_institute_id?: string | null;
    source_reference_table?: string | null;
    source_reference_id?: string | null;
    metadata?: Record<string, unknown> | null;
    conversion_status?: string | null;
  };
  notes: Array<{ id: string; note: string; is_pinned: boolean | null; created_at: string | null }>;
  activities: Array<{ id: string; activity_type: string; title: string; description: string | null; created_at: string | null }>;
  followUps: Array<{ id: string; due_at: string; channel: string | null; purpose: string | null; status: string; assigned_to: string | null }>;
  tags: Array<{ tagId: string; tag: { id: string; name: string; color: string | null } | null }>;
  linkedProfile: { id: string; full_name: string | null; email: string | null; role: string | null } | null;
  linkedInstitute: { id: string; name: string | null; status: string | null } | null;
};

type DashboardData = {
  data: CrmContact[];
  page: number;
  pageSize: number;
  total: number;
  kpis: {
    totalContacts: number;
    newContacts: number;
    contacted: number;
    qualified: number;
    converted: number;
    overdueFollowUps: number;
    followUpsDueToday: number;
    sourceCounts: Record<string, number>;
    serviceTypeCounts: Record<string, number>;
  };
};

type CrmTag = { id: string; name: string; color: string | null };

const stageOptions = ["", "new", "contacted", "qualified", "converted", "lost"];
const priorityOptions = ["", "low", "medium", "high", "urgent"];

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function badgeClass(value: string | null | undefined, type: "stage" | "priority") {
  const v = (value ?? "").toLowerCase();
  if (type === "stage") {
    if (v === "converted") return "bg-emerald-100 text-emerald-700";
    if (v === "qualified") return "bg-blue-100 text-blue-700";
    if (v === "contacted") return "bg-amber-100 text-amber-700";
    if (v === "lost") return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-700";
  }
  if (v === "urgent") return "bg-rose-100 text-rose-700";
  if (v === "high") return "bg-orange-100 text-orange-700";
  if (v === "medium") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

export function AdminCrmDashboard() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<DashboardData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [allTags, setAllTags] = useState<CrmTag[]>([]);

  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editNextFollowUpAt, setEditNextFollowUpAt] = useState("");

  const sources = useMemo(() => Object.keys(result?.kpis.sourceCounts ?? {}), [result]);
  const serviceTypes = useMemo(() => Object.keys(result?.kpis.serviceTypeCounts ?? {}), [result]);

  async function loadContacts(options?: { page?: number }) {
    setLoading(true);
    const effectivePage = options?.page ?? page;
    const qs = new URLSearchParams({ page: String(effectivePage), pageSize: "20", sort });
    if (search) qs.set("search", search);
    if (stage) qs.set("stage", stage);
    if (priority) qs.set("priority", priority);
    if (source) qs.set("source", source);
    if (serviceType) qs.set("serviceType", serviceType);
    if (assignedTo) qs.set("assignedTo", assignedTo);
    if (overdueOnly) qs.set("overdue", "true");

    const [contactsResp, tagsResp] = await Promise.all([fetch(`/api/admin/crm/contacts?${qs.toString()}`), fetch("/api/admin/crm/tags")]);
    const contactsBody = await contactsResp.json();

    if (!contactsResp.ok) {
      setMessage(contactsBody.error ?? "Failed to load contacts");
      setLoading(false);
      return;
    }

    if (tagsResp.ok) {
      const tagsBody = await tagsResp.json();
      setAllTags(tagsBody.tags ?? []);
    }

    setResult(contactsBody as DashboardData);
    setLoading(false);
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    const response = await fetch(`/api/admin/crm/contacts/${id}`);
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to load detail");
      setDetailLoading(false);
      return;
    }
    const detailBody = body as ContactDetail;
    setDetail(detailBody);
    setEditAssignedTo(detailBody.contact.assigned_to ?? "");
    setEditNextFollowUpAt(
      detailBody.contact.next_follow_up_at ? new Date(detailBody.contact.next_follow_up_at).toISOString().slice(0, 16) : ""
    );
    setDetailLoading(false);
  }

  useEffect(() => {
    void loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sort]);

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    await loadContacts({ page: 1 });
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    await loadDetail(id);
  }

  async function patchContact(payload: Record<string, unknown>) {
    if (!selectedId) return;
    const response = await fetch(`/api/admin/crm/contacts/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Update failed");
      return;
    }
    setMessage("Contact updated");
    await Promise.all([loadContacts(), loadDetail(selectedId)]);
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/crm/contacts/${selectedId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: formData.get("note"), is_pinned: formData.get("is_pinned") === "on" }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to add note");
      return;
    }
    setMessage("Note added");
    event.currentTarget.reset();
    await loadDetail(selectedId);
  }

  async function addFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/crm/contacts/${selectedId}/follow-ups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        due_at: formData.get("due_at"),
        channel: formData.get("channel"),
        purpose: formData.get("purpose"),
        assigned_to: formData.get("assigned_to"),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Unable to create follow-up");
      return;
    }
    setMessage("Follow-up scheduled");
    event.currentTarget.reset();
    await Promise.all([loadContacts(), loadDetail(selectedId)]);
  }

  async function markFollowUpStatus(followUpId: string, status: "completed" | "cancelled") {
    const response = await fetch(`/api/admin/crm/follow-ups/${followUpId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? `Unable to ${status} follow-up`);
      return;
    }
    if (selectedId) {
      await Promise.all([loadContacts(), loadDetail(selectedId)]);
    }
  }

  async function attachTag(tagId: string) {
    if (!selectedId || !tagId) return;
    const response = await fetch(`/api/admin/crm/contacts/${selectedId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_id: tagId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to attach tag");
      return;
    }
    await loadDetail(selectedId);
  }

  async function removeTag(tagId: string) {
    if (!selectedId || !tagId) return;
    const response = await fetch(`/api/admin/crm/contacts/${selectedId}/tags?tagId=${encodeURIComponent(tagId)}`, {
      method: "DELETE",
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Failed to remove tag");
      return;
    }
    await loadDetail(selectedId);
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-8">
      <h1 className="vi-page-title">Admin CRM</h1>
      {message ? <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">{message}</p> : null}

      <section className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        {[
          ["Total", result?.kpis.totalContacts ?? 0],
          ["New", result?.kpis.newContacts ?? 0],
          ["Contacted", result?.kpis.contacted ?? 0],
          ["Qualified", result?.kpis.qualified ?? 0],
          ["Converted", result?.kpis.converted ?? 0],
          ["Overdue", result?.kpis.overdueFollowUps ?? 0],
          ["Due today", result?.kpis.followUpsDueToday ?? 0],
          ["Sources", Object.keys(result?.kpis.sourceCounts ?? {}).length],
        ].map(([label, value]) => (
          <article key={String(label)} className="vi-card p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </article>
        ))}
      </section>

      <form onSubmit={applyFilters} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4 xl:grid-cols-8">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name/email/phone" className="vi-input py-2 text-sm" />
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="vi-input py-2 text-sm">
          <option value="">All stages</option>
          {stageOptions.filter(Boolean).map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="vi-input py-2 text-sm">
          <option value="">All priorities</option>
          {priorityOptions.filter(Boolean).map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="vi-input py-2 text-sm">
          <option value="">All sources</option>
          {sources.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className="vi-input py-2 text-sm">
          <option value="">All services</option>
          {serviceTypes.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Assigned admin id" className="vi-input py-2 text-sm" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="vi-input py-2 text-sm">
          <option value="newest">Newest</option>
          <option value="last_activity">Last activity</option>
          <option value="next_follow_up">Next follow-up</option>
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />Overdue only</label>
        <button className="rounded bg-brand-600 px-3 py-2 text-sm text-white" type="submit">Apply filters</button>
      </form>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded border bg-white p-2">
          {loading ? <p className="p-4 text-sm text-slate-600">Loading contacts...</p> : null}
          {!loading && !result?.data.length ? <p className="p-4 text-sm text-slate-600">No CRM contacts match these filters yet.</p> : null}
          {result?.data.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs md:text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2">Name</th><th className="px-2 py-2">Phone</th><th className="px-2 py-2">Email</th><th className="px-2 py-2">Source</th><th className="px-2 py-2">Service</th><th className="px-2 py-2">Stage</th><th className="px-2 py-2">Priority</th><th className="px-2 py-2">Assigned</th><th className="px-2 py-2">Next follow-up</th><th className="px-2 py-2">Last activity</th><th className="px-2 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((contact) => (
                    <tr key={contact.id} onClick={() => void openDetail(contact.id)} className={`cursor-pointer border-t hover:bg-slate-50 ${selectedId === contact.id ? "bg-blue-50" : ""}`}>
                      <td className="px-2 py-2 font-medium">{contact.full_name ?? "Unnamed"}</td>
                      <td className="px-2 py-2">{contact.phone ?? "—"}</td>
                      <td className="px-2 py-2">{contact.email ?? "—"}</td>
                      <td className="px-2 py-2">{contact.source ?? "—"}</td>
                      <td className="px-2 py-2">{contact.service_type ?? "—"}</td>
                      <td className="px-2 py-2"><span className={`rounded px-2 py-1 text-xs ${badgeClass(contact.lifecycle_stage, "stage")}`}>{contact.lifecycle_stage ?? "new"}</span></td>
                      <td className="px-2 py-2"><span className={`rounded px-2 py-1 text-xs ${badgeClass(contact.priority, "priority")}`}>{contact.priority ?? "low"}</span></td>
                      <td className="px-2 py-2">{contact.assigned_to ?? "—"}</td>
                      <td className="px-2 py-2">{fmt(contact.next_follow_up_at)}</td>
                      <td className="px-2 py-2">{fmt(contact.last_activity_at)}</td>
                      <td className="px-2 py-2">{fmt(contact.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex items-center justify-between p-3 text-sm">
            <p>Page {result?.page ?? 1} of {Math.max(1, Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 20)))}</p>
            <div className="space-x-2">
              <button disabled={(result?.page ?? 1) <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} className="rounded border px-2 py-1 disabled:opacity-50">Prev</button>
              <button disabled={(result?.page ?? 1) >= Math.ceil((result?.total ?? 0) / (result?.pageSize ?? 20))} onClick={() => setPage((prev) => prev + 1)} className="rounded border px-2 py-1 disabled:opacity-50">Next</button>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded border bg-white p-3">
          {!selectedId ? <p className="text-sm text-slate-600">Select a contact to view complete CRM detail.</p> : null}
          {detailLoading ? <p className="text-sm text-slate-600">Loading contact detail...</p> : null}
          {detail && selectedId ? (
            <>
              <div className="rounded border p-3">
                <h2 className="font-semibold">Overview</h2>
                <p className="text-sm">{detail.contact.full_name ?? "Unnamed"} · {detail.contact.email ?? "no-email"} · {detail.contact.phone ?? "no-phone"}</p>
                <p className="mt-1 text-xs text-slate-600">Source: {detail.contact.source ?? "—"} · Service: {detail.contact.service_type ?? "—"}</p>
                <p className="mt-1 text-xs text-slate-600">Linked profile: {detail.contact.linked_profile_id ?? "—"} · Linked institute: {detail.contact.linked_institute_id ?? "—"}</p>
                <p className="mt-1 text-xs text-slate-600">Source ref: {detail.contact.source_reference_table ?? "—"} / {detail.contact.source_reference_id ?? "—"}</p>
                <p className="mt-1 text-xs text-slate-600">Conversion: {detail.contact.conversion_status ?? "—"}</p>
              </div>

              <div className="grid gap-2 rounded border p-3">
                <h3 className="font-semibold">Update stage / priority / assignment</h3>
                <div className="grid gap-2 md:grid-cols-2">
                  <select defaultValue={detail.contact.lifecycle_stage ?? ""} onChange={(e) => void patchContact({ lifecycle_stage: e.target.value })} className="rounded border px-2 py-2 text-sm">
                    {stageOptions.map((item) => <option key={item || "none"} value={item}>{item || "Set stage"}</option>)}
                  </select>
                  <select defaultValue={detail.contact.priority ?? ""} onChange={(e) => void patchContact({ priority: e.target.value })} className="rounded border px-2 py-2 text-sm">
                    {priorityOptions.map((item) => <option key={item || "none"} value={item}>{item || "Set priority"}</option>)}
                  </select>
                  <input
                    value={editAssignedTo}
                    onChange={(e) => setEditAssignedTo(e.target.value)}
                    onBlur={(e) => void patchContact({ assigned_to: e.target.value })}
                    placeholder="Assign admin id"
                    className="rounded border px-2 py-2 text-sm"
                  />
                  <input
                    type="datetime-local"
                    value={editNextFollowUpAt}
                    onChange={(e) => setEditNextFollowUpAt(e.target.value)}
                    onBlur={(e) => void patchContact({ next_follow_up_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="rounded border px-2 py-2 text-sm"
                  />
                </div>
              </div>

              <form onSubmit={addNote} className="rounded border p-3">
                <h3 className="font-semibold">Notes</h3>
                <textarea name="note" required className="mt-2 w-full rounded border px-2 py-2 text-sm" placeholder="Add important note..." />
                <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" name="is_pinned" />Pin note</label>
                <button className="mt-2 rounded bg-brand-600 px-3 py-2 text-xs text-white">Add note</button>
                <div className="mt-2 space-y-2 text-xs">
                  {detail.notes.map((note) => (
                    <div key={note.id} className="rounded bg-slate-50 p-2">
                      {note.is_pinned ? <span className="mr-1 rounded bg-amber-100 px-1 py-0.5">Pinned</span> : null}
                      {note.note}
                      <p className="text-slate-500">{fmt(note.created_at)}</p>
                    </div>
                  ))}
                </div>
              </form>

              <form onSubmit={addFollowUp} className="rounded border p-3">
                <h3 className="font-semibold">Follow-ups</h3>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <input name="due_at" type="datetime-local" required className="rounded border px-2 py-2 text-xs" />
                  <input name="channel" placeholder="call / whatsapp / email" required className="rounded border px-2 py-2 text-xs" />
                  <input name="purpose" placeholder="Purpose" required className="rounded border px-2 py-2 text-xs" />
                  <input name="assigned_to" placeholder="Assigned admin id (optional)" className="rounded border px-2 py-2 text-xs" />
                </div>
                <button className="mt-2 rounded bg-brand-600 px-3 py-2 text-xs text-white">Create follow-up</button>
                <div className="mt-2 space-y-2 text-xs">
                  {detail.followUps.map((followUp) => (
                    <div key={followUp.id} className="rounded bg-slate-50 p-2">
                      <p>{followUp.channel ?? "—"} · {followUp.purpose ?? "—"}</p>
                      <p>Due: {fmt(followUp.due_at)} · Status: {followUp.status}</p>
                      {followUp.status === "pending" ? (
                        <div className="mt-1 flex gap-2">
                          <button type="button" onClick={() => void markFollowUpStatus(followUp.id, "completed")} className="rounded bg-emerald-700 px-2 py-1 text-white">Complete</button>
                          <button type="button" onClick={() => void markFollowUpStatus(followUp.id, "cancelled")} className="rounded bg-rose-700 px-2 py-1 text-white">Cancel</button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </form>

              <div className="rounded border p-3">
                <h3 className="font-semibold">Tags</h3>
                <select onChange={(e) => void attachTag(e.target.value)} defaultValue="" className="mt-2 rounded border px-2 py-2 text-xs">
                  <option value="">Attach tag</option>
                  {allTags.map((tag) => (
                    <option key={tag.id} value={tag.id}>{tag.name}</option>
                  ))}
                </select>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {detail.tags.map((item) => (
                    <button key={item.tagId} type="button" onClick={() => void removeTag(item.tagId)} className="rounded border px-2 py-1" style={{ borderColor: item.tag?.color ?? "#cbd5e1" }}>
                      {item.tag?.name ?? item.tagId} ✕
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded border p-3">
                <h3 className="font-semibold">Activity timeline</h3>
                <div className="mt-2 space-y-2 text-xs">
                  {detail.activities.map((activity) => (
                    <div key={activity.id} className="rounded bg-slate-50 p-2">
                      <p className="font-medium">{activity.title}</p>
                      <p>{activity.description ?? activity.activity_type}</p>
                      <p className="text-slate-500">{fmt(activity.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
