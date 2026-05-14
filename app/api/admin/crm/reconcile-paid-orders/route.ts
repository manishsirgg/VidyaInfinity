import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api-auth";
import {
  reconcilePaidCourseOrdersToCrm,
  reconcilePaidWebinarOrdersToCrm,
  reconcileSingleCourseOrderToCrm,
  reconcileSingleWebinarOrderToCrm,
} from "@/lib/institute/crm-paid-reconciliation";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireApiUser("admin");
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const kind = typeof body?.kind === "string" ? body.kind : "all";
  const limit = Number.isFinite(body?.limit) ? Number(body.limit) : 50;
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : null;

  if (!["course", "webinar", "all"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  if (orderId && !UUID_REGEX.test(orderId)) {
    return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });
  }

  const course = { processed: 0, converted: 0, skipped: 0, errors: [] as string[] };
  const webinar = { processed: 0, converted: 0, skipped: 0, errors: [] as string[] };

  if (orderId) {
    if (kind === "course") Object.assign(course, await reconcileSingleCourseOrderToCrm(orderId));
    else if (kind === "webinar") Object.assign(webinar, await reconcileSingleWebinarOrderToCrm(orderId));
    else return NextResponse.json({ error: "orderId requires kind=course or kind=webinar" }, { status: 400 });
  } else {
    if (kind === "course" || kind === "all") Object.assign(course, await reconcilePaidCourseOrdersToCrm({ limit }));
    if (kind === "webinar" || kind === "all") Object.assign(webinar, await reconcilePaidWebinarOrdersToCrm({ limit }));
  }

  return NextResponse.json({ ok: true, kind, course, webinar });
}
