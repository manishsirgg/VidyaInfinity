import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireApiUser("institute", { requireApproved: false });
  if ("error" in auth) return auth.error;

  const admin = getSupabaseAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: 500 });

  const { id } = await params;
  const { data: institute } = await admin.data.from("institutes").select("id").eq("user_id", auth.user.id).maybeSingle<{ id: string }>();
  if (!institute) return NextResponse.json({ error: "Institute record not found" }, { status: 404 });

  const { data: current } = await admin.data
    .from("courses")
    .select("id,status")
    .eq("id", id)
    .eq("institute_id", institute.id)
    .maybeSingle<{ id: string; status: string }>();

  if (!current) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  if (current.status !== "rejected") {
    return NextResponse.json({ error: "Only rejected courses can be resubmitted." }, { status: 409 });
  }

  const payload = await request.json();

  const patchResponse = await fetch(new URL(`/api/institute/courses/${id}`, request.url), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify(payload),
  });

  const patchBody = await patchResponse.json().catch(() => null);
  return NextResponse.json(patchBody, { status: patchResponse.status });
}
