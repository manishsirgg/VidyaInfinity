export type InstituteEnrollmentEligibilityRow = {
  id: string;
  status: string | null;
  verified: boolean | null;
  rejection_reason: string | null;
  is_deleted?: boolean | null;
};

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isInstituteEligibleForEnrollment(institute: InstituteEnrollmentEligibilityRow | null | undefined) {
  if (!institute || institute.is_deleted) return false;

  const normalizedStatus = normalizeStatus(institute.status);
  if (!["approved", "active"].includes(normalizedStatus)) return false;
  if (institute.verified !== true) return false;
  if (institute.rejection_reason !== null) return false;

  return true;
}
