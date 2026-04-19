export type FeaturedPlanCode = "weekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";

export type FeaturedPlan = {
  code: FeaturedPlanCode;
  label: string;
  amount: number;
  durationDays: number;
  description: string;
};

export const featuredInstitutePlans: FeaturedPlan[] = [
  { code: "weekly", label: "1 Week", amount: 99, durationDays: 7, description: "Quick visibility boost for fresh announcements." },
  { code: "monthly", label: "1 Month", amount: 299, durationDays: 30, description: "Best for continuous lead generation each month." },
  { code: "quarterly", label: "3 Months", amount: 999, durationDays: 90, description: "Stable featured placement for an entire quarter." },
  { code: "half_yearly", label: "6 Months", amount: 1999, durationDays: 180, description: "Long-running campaign for high intent admissions." },
  { code: "yearly", label: "1 Year", amount: 3999, durationDays: 365, description: "Maximum visibility and lead momentum year-round." },
];
