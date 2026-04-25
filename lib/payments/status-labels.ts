function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function titleize(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getPaymentStatusLabel(status: string | null | undefined) {
  const normalized = normalize(status);
  if (!normalized) return "Unknown";
  if (normalized === "paid") return "Paid";
  if (normalized === "refunded") return "Refunded";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  return titleize(normalized);
}

export function getEnrollmentStatusLabel(status: string | null | undefined) {
  const normalized = normalize(status);
  if (!normalized) return "Unknown";
  if (["enrolled", "active"].includes(normalized)) return "Enrolled";
  if (normalized === "refunded") return "Refunded";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  if (normalized === "revoked") return "Refunded / Cancelled";
  return titleize(normalized);
}

export function getAccessStatusLabel(status: string | null | undefined) {
  const normalized = normalize(status);
  if (!normalized) return "Unknown";
  if (["granted", "active", "revealed"].includes(normalized)) return "Active";
  if (["revoked", "refunded", "cancelled", "canceled"].includes(normalized)) return "Access revoked";
  return titleize(normalized);
}

export function getRegistrationStatusLabel(status: string | null | undefined) {
  const normalized = normalize(status);
  if (!normalized) return "Unknown";
  if (normalized === "registered") return "Registered";
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "refunded") return "Cancelled";
  return titleize(normalized);
}
