export const couponScopes = ["course", "webinar", "psychometric", "all"] as const;

export type CouponScope = (typeof couponScopes)[number];

type CouponRow = {
  id?: string;
  code: string;
  discount_percent: number | null;
  active: boolean | null;
  expiry_date: string | null;
  applies_to: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  max_uses?: number | null;
  used_count?: number | null;
};

export function isCouponScope(value: unknown): value is CouponScope {
  return typeof value === "string" && couponScopes.includes(value as CouponScope);
}

export function normalizeCouponCode(code: unknown) {
  return String(code ?? "").trim().toUpperCase();
}

export function isCouponExpired(expiryDate: string | null | undefined) {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  if (!Number.isNaN(expiry.getTime())) {
    return expiry.getTime() < Date.now();
  }
  const today = new Date().toISOString().slice(0, 10);
  return String(expiryDate).trim() < today;
}

export function isCouponApplicable(couponAppliesTo: string | null | undefined, checkoutScope: CouponScope) {
  if (!couponAppliesTo) return false;
  return couponAppliesTo === checkoutScope || couponAppliesTo === "all";
}

export function validateCouponForScope(coupon: CouponRow | null, scope: CouponScope) {
  if (!coupon) return { ok: false as const, reason: "Coupon not found" };
  if (!isCouponApplicable(coupon.applies_to, scope)) return { ok: false as const, reason: `Coupon is not valid for ${scope}` };
  if (!coupon.active) return { ok: false as const, reason: "Coupon is inactive" };
  if (coupon.is_deleted || coupon.deleted_at) return { ok: false as const, reason: "Coupon is deleted" };
  if (isCouponExpired(coupon.expiry_date)) return { ok: false as const, reason: "Coupon has expired" };
  if (coupon.max_uses !== null && coupon.max_uses !== undefined && (coupon.used_count ?? 0) >= coupon.max_uses) {
    return { ok: false as const, reason: "Coupon usage limit reached" };
  }
  if (!coupon.discount_percent || coupon.discount_percent <= 0) return { ok: false as const, reason: "Coupon discount is invalid" };
  return { ok: true as const };
}

export function getCouponErrorMessage(reason: string) {
  switch (reason) {
    case "Coupon not found":
      return "Invalid coupon code for this purchase.";
    case "Coupon has expired":
      return "This coupon has expired.";
    case "Coupon is inactive":
      return "This coupon is currently inactive.";
    case "Coupon is deleted":
      return "This coupon is no longer available.";
    case "Coupon usage limit reached":
      return "This coupon has reached its maximum usage limit.";
    case "Coupon discount is invalid":
      return "This coupon is not configured correctly. Please contact support.";
    default:
      if (reason.startsWith("Coupon is not valid for")) {
        return "This coupon is not valid for this item.";
      }
      return reason;
  }
}
