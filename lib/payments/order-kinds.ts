export const CANONICAL_ORDER_KINDS = ["course_enrollment", "psychometric_test", "webinar_registration"] as const;

export type CanonicalOrderKind = (typeof CANONICAL_ORDER_KINDS)[number];

export const REFUND_ORDER_TYPE_TO_CANONICAL_KIND = {
  course: "course_enrollment",
  psychometric: "psychometric_test",
  webinar: "webinar_registration",
} as const satisfies Record<string, CanonicalOrderKind>;

export type RefundOrderType = keyof typeof REFUND_ORDER_TYPE_TO_CANONICAL_KIND;

const REFUND_ORDER_TYPES = Object.keys(REFUND_ORDER_TYPE_TO_CANONICAL_KIND) as RefundOrderType[];

export function isCanonicalOrderKind(value: unknown): value is CanonicalOrderKind {
  return typeof value === "string" && CANONICAL_ORDER_KINDS.includes(value as CanonicalOrderKind);
}

export function parseRefundOrderType(value: unknown): RefundOrderType | null {
  if (typeof value !== "string") return null;
  return REFUND_ORDER_TYPES.includes(value as RefundOrderType) ? (value as RefundOrderType) : null;
}

export function toCanonicalOrderKind(orderType: RefundOrderType): CanonicalOrderKind {
  return REFUND_ORDER_TYPE_TO_CANONICAL_KIND[orderType];
}
