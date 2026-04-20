export const ORGANIZATION_TYPE_OPTIONS = [
  "Coaching Institute",
  "Academy",
  "College",
  "University",
  "School",
  "Skill Center",
  "Training Institute",
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPE_OPTIONS)[number];

const LEGACY_ORGANIZATION_TYPE_MAP: Record<string, OrganizationType> = {
  school: "School",
  coaching_institute: "Coaching Institute",
  college: "College",
  university: "University",
  academy: "Academy",
  skill_center: "Skill Center",
  training_institute: "Training Institute",
  edtech: "Training Institute",
};

export function isOrganizationType(value: string): value is OrganizationType {
  return ORGANIZATION_TYPE_OPTIONS.includes(value as OrganizationType);
}

export function normalizeOrganizationType(value: string): OrganizationType | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isOrganizationType(trimmed)) return trimmed;

  const normalizedKey = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
  return LEGACY_ORGANIZATION_TYPE_MAP[normalizedKey] ?? null;
}

export function getOrganizationTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return normalizeOrganizationType(value) ?? value;
}
