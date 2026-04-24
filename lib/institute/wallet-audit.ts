import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type AnyRecord = Record<string, unknown>;

type WalletAuditEventInput = {
  instituteId: string;
  eventType: string;
  sourceTable?: string | null;
  sourceId?: string | null;
  payoutId?: string | null;
  payoutRequestId?: string | null;
  orderId?: string | null;
  orderKind?: string | null;
  amount?: number | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  idempotencyKey?: string | null;
  metadata?: AnyRecord | null;
};

type AuditClient = Pick<SupabaseClient, "from">;

export async function logInstituteWalletEvent(event: WalletAuditEventInput, client?: AuditClient) {
  const instituteId = String(event.instituteId ?? "").trim();
  const eventType = String(event.eventType ?? "").trim();
  if (!instituteId || !eventType) return { ok: false as const, error: "instituteId and eventType are required." };

  const toNullable = (value: string | null | undefined) => {
    const normalized = String(value ?? "").trim();
    return normalized.length > 0 ? normalized : null;
  };

  const payload = {
    institute_id: instituteId,
    event_type: eventType,
    source_table: event.sourceTable ?? null,
    source_id: toNullable(event.sourceId),
    payout_id: toNullable(event.payoutId),
    payout_request_id: toNullable(event.payoutRequestId),
    order_id: toNullable(event.orderId),
    order_kind: event.orderKind ?? null,
    amount: typeof event.amount === "number" && Number.isFinite(event.amount) ? event.amount : null,
    previous_status: event.previousStatus ?? null,
    new_status: event.newStatus ?? null,
    actor_user_id: event.actorUserId ?? null,
    actor_role: event.actorRole ?? null,
    idempotency_key: event.idempotencyKey ?? null,
    metadata: event.metadata ?? {},
  };

  const admin = getSupabaseAdmin();
  const resolvedClient = client ?? (admin.ok ? admin.data : null);
  if (!resolvedClient) return { ok: false as const, error: "Supabase admin client is unavailable." };

  const { error } = await resolvedClient.from("institute_wallet_audit_logs").insert(payload);
  if (!error) return { ok: true as const };

  const message = String(error.message ?? "").toLowerCase();
  if (error.code === "23505" || message.includes("duplicate key")) {
    return { ok: true as const, duplicate: true as const };
  }

  console.error("[wallet/audit] log_institute_wallet_event_failed", {
    event_type: eventType,
    institute_id: instituteId,
    idempotency_key: event.idempotencyKey ?? null,
    error: error.message,
  });

  return { ok: false as const, error: error.message };
}
