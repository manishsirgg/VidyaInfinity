export const ORGANIZATION_TYPE_OPTIONS = [
  { value: "Coaching Institute", label: "Coaching Institute" },
  { value: "Academy", label: "Academy" },
  { value: "College", label: "College" },
  { value: "University", label: "University" },
  { value: "Skill Center", label: "Skill Center" },
  { value: "Training Institute", label: "Training Institute" },
  { value: "educator_coach", label: "Educator / Coach" },
] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPE_OPTIONS)[number]["value"] | "School";

const LEGACY_ORGANIZATION_TYPE_MAP: Record<string, OrganizationType> = {
  school: "School",
  coaching_institute: "Coaching Institute",
  college: "College",
  university: "University",
  academy: "Academy",
  skill_center: "Skill Center",
  training_institute: "Training Institute",
  educator_coach: "educator_coach",
  educator: "educator_coach",
  coach: "educator_coach",
  trainer: "educator_coach",
  mentor: "educator_coach",
  edtech: "Training Institute",
};

const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  ...Object.fromEntries(ORGANIZATION_TYPE_OPTIONS.map((option) => [option.value, option.label])),
  School: "School",
} as Record<OrganizationType, string>;

export function isOrganizationType(value: string): value is OrganizationType {
  return ORGANIZATION_TYPE_OPTIONS.some((option) => option.value === value) || value === "School";
}

export function normalizeOrganizationType(value: string): OrganizationType | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isOrganizationType(trimmed)) return trimmed;

  const normalizedKey = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return LEGACY_ORGANIZATION_TYPE_MAP[normalizedKey] ?? null;
}

export function getOrganizationTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalizedValue = normalizeOrganizationType(value);
  if (!normalizedValue) return value;
  return ORGANIZATION_TYPE_LABELS[normalizedValue] ?? value;
}
