import { ORGANIZATION_TYPE_OPTIONS, type OrganizationType } from "@/lib/constants/organization-types";

export const DEFAULT_ENTITY_COMMISSION_PERCENT_BY_TYPE = {
  "Coaching Institute": 50,
  Academy: 50,
  College: 50,
  University: 70,
  "Skill Center": 50,
  "Training Institute": 50,
  educator_coach: 50,
} satisfies Record<(typeof ORGANIZATION_TYPE_OPTIONS)[number]["value"], number>;

export const DEFAULT_WEBINAR_COMMISSION_PERCENT = 25;

export function getDefaultEntityCommissionPercent(entityType: OrganizationType) {
  if (entityType === "School") return 50;
  return DEFAULT_ENTITY_COMMISSION_PERCENT_BY_TYPE[entityType];
}
