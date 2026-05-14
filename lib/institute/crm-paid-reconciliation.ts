import "server-only";

import { markCourseOrderConvertedInCrm, markWebinarOrderConvertedInCrm, safeRunCrmAutomation } from "@/lib/institute/crm-automation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ReconcileSummary = { processed: number; converted: number; skipped: number; errors: string[] };

const COURSE_SUCCESS_STATUSES = ["paid", "captured", "success", "confirmed"];

export async function reconcileSingleCourseOrderToCrm(courseOrderId: string): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { processed: 1, converted: 0, skipped: 0, errors: [] };
  await safeRunCrmAutomation("course-paid", async () => {
    const result = await markCourseOrderConvertedInCrm(courseOrderId);
    if (result.contactId) summary.converted += 1; else summary.skipped += 1;
  });
  return summary;
}

export async function reconcileSingleWebinarOrderToCrm(webinarOrderId: string): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { processed: 1, converted: 0, skipped: 0, errors: [] };
  await safeRunCrmAutomation("webinar-paid", async () => {
    const result = await markWebinarOrderConvertedInCrm(webinarOrderId);
    if (result.contactId) summary.converted += 1; else summary.skipped += 1;
  });
  return summary;
}

export async function reconcilePaidCourseOrdersToCrm({ limit = 50 }: { limit?: number } = {}): Promise<ReconcileSummary> {
  const admin = getSupabaseAdmin();
  if (!admin.ok) throw new Error(admin.error);
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const { data, error } = await admin.data
    .from("course_orders")
    .select("id,payment_status")
    .in("payment_status", COURSE_SUCCESS_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  const summary: ReconcileSummary = { processed: data?.length ?? 0, converted: 0, skipped: 0, errors: [] };
  for (const row of data ?? []) {
    try {
      const single = await reconcileSingleCourseOrderToCrm(row.id);
      summary.converted += single.converted;
      summary.skipped += single.skipped;
    } catch (error) {
      summary.errors.push(`course_order:${row.id}:${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }
  return summary;
}

export async function reconcilePaidWebinarOrdersToCrm({ limit = 50 }: { limit?: number } = {}): Promise<ReconcileSummary> {
  const admin = getSupabaseAdmin();
  if (!admin.ok) throw new Error(admin.error);
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const { data, error } = await admin.data
    .from("webinar_orders")
    .select("id,payment_status,order_status,access_status")
    .eq("payment_status", "paid")
    .in("order_status", ["confirmed"])
    .in("access_status", ["granted"])
    .order("updated_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  const summary: ReconcileSummary = { processed: data?.length ?? 0, converted: 0, skipped: 0, errors: [] };
  for (const row of data ?? []) {
    try {
      const single = await reconcileSingleWebinarOrderToCrm(row.id);
      summary.converted += single.converted;
      summary.skipped += single.skipped;
    } catch (error) {
      summary.errors.push(`webinar_order:${row.id}:${error instanceof Error ? error.message : "unknown_error"}`);
    }
  }
  return summary;
}

