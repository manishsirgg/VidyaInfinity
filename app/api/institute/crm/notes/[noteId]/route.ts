import { NextResponse } from "next/server";
import { isUuid, requireInstituteApiContext } from "@/lib/institute/crm";

export async function PATCH(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params; if (!isUuid(noteId)) return NextResponse.json({ error: "Invalid note id" }, { status: 400 });
  const ctx = await requireInstituteApiContext(); if ("error" in ctx) return ctx.error;
  const { admin, instituteId } = ctx; const body = await request.json();
  const { data, error } = await admin.from("crm_notes").update({ note: body.note, is_pinned: body.is_pinned, metadata: body.metadata, updated_at: new Date().toISOString() }).eq("id", noteId).eq("institute_id", instituteId).eq("is_deleted", false).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ note: data });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params; if (!isUuid(noteId)) return NextResponse.json({ error: "Invalid note id" }, { status: 400 });
  const ctx = await requireInstituteApiContext(); if ("error" in ctx) return ctx.error;
  const { admin, instituteId, userId } = ctx;
  const { data, error } = await admin.from("crm_notes").update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: userId }).eq("id", noteId).eq("institute_id", instituteId).eq("is_deleted", false).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
