export const ACTIVE_COURSE_ENROLLMENT_STATUSES = new Set(["active", "pending", "suspended", "completed"]);
export const INACTIVE_COURSE_ENROLLMENT_STATUSES = new Set(["cancelled", "canceled", "revoked", "inactive", "expired", "dropped", "refunded", "failed"]);

export const ACTIVE_WEBINAR_REGISTRATION_STATUSES = new Set(["registered"]);
export const INACTIVE_WEBINAR_REGISTRATION_STATUSES = new Set(["cancelled", "canceled", "revoked", "refunded"]);

export const REFUND_BLOCKING_PAYMENT_STATUSES = new Set(["refunded", "failed", "cancelled", "canceled", "rejected"]);

export function normalizeEntitlementStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function isPaymentActiveForEntitlement(status: string | null | undefined) {
  const normalized = normalizeEntitlementStatus(status);
  if (!normalized) return false;
  return !REFUND_BLOCKING_PAYMENT_STATUSES.has(normalized);
}

export function isCourseEnrollmentCurrentlyActive({
  enrollmentStatus,
  paymentStatus,
  accessEndAt,
}: {
  enrollmentStatus: string | null | undefined;
  paymentStatus: string | null | undefined;
  accessEndAt?: string | null;
}) {
  const normalizedEnrollment = normalizeEntitlementStatus(enrollmentStatus);
  const normalizedPayment = normalizeEntitlementStatus(paymentStatus);

  if (normalizedEnrollment && INACTIVE_COURSE_ENROLLMENT_STATUSES.has(normalizedEnrollment)) return false;
  if (normalizedPayment && REFUND_BLOCKING_PAYMENT_STATUSES.has(normalizedPayment)) return false;

  if (accessEndAt) {
    const accessEndAtMs = new Date(accessEndAt).getTime();
    if (Number.isFinite(accessEndAtMs) && accessEndAtMs <= Date.now()) return false;
  }

  if (!normalizedEnrollment) return true;
  return ACTIVE_COURSE_ENROLLMENT_STATUSES.has(normalizedEnrollment);
}

export function isWebinarRegistrationCurrentlyActive({
  registrationStatus,
  paymentStatus,
  accessStatus,
}: {
  registrationStatus: string | null | undefined;
  paymentStatus: string | null | undefined;
  accessStatus: string | null | undefined;
}) {
  const normalizedRegistration = normalizeEntitlementStatus(registrationStatus);
  const normalizedPayment = normalizeEntitlementStatus(paymentStatus);
  const normalizedAccess = normalizeEntitlementStatus(accessStatus);

  if (INACTIVE_WEBINAR_REGISTRATION_STATUSES.has(normalizedRegistration)) return false;
  if (REFUND_BLOCKING_PAYMENT_STATUSES.has(normalizedPayment)) return false;
  if (["revoked", "cancelled", "canceled", "refunded"].includes(normalizedAccess)) return false;

  return ACTIVE_WEBINAR_REGISTRATION_STATUSES.has(normalizedRegistration) && ["granted", "revealed", "locked", "pending"].includes(normalizedAccess || "pending");
}
