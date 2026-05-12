import { NextResponse } from "next/server";
import { CRM_NOTE_TYPES, inValues, isUuid, requireInstituteApiContext } from "@/lib/institute/crm";

export async function POST(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params; if (!isUuid(contactId)) return NextResponse.json({ error: "Invalid contact id" }, { status: 400 });
  const ctx = await requireInstituteApiContext(); if ("error" in ctx) return ctx.error;
  const { admin, instituteId, userId } = ctx;
  const { data: contact } = await admin.from("crm_contacts").select("id").eq("id", contactId).eq("owner_type", "institute").eq("owner_institute_id", instituteId).maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const body = await request.json();
  const note = typeof body.note === "string" ? body.note.trim() : ""; if (!note) return NextResponse.json({ error: "note is required" }, { status: 400 });
  const noteType = typeof body.note_type === "string" ? body.note_type : "general";
  if (!inValues(noteType, CRM_NOTE_TYPES)) return NextResponse.json({ error: "Invalid note type" }, { status: 400 });
  const { data, error } = await admin.from("crm_notes").insert({ contact_id: contactId, institute_id: instituteId, author_user_id: userId, note_type: noteType, note, is_pinned: Boolean(body.is_pinned), metadata: body.metadata ?? {} }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("crm_activities").insert({ contact_id: contactId, institute_id: instituteId, actor_user_id: userId, activity_type: "note_added", title: "Note added", description: note.slice(0, 120), metadata: { noteId: data.id } });
  return NextResponse.json({ note: data });
}
