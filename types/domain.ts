export type Role = "student" | "institute" | "admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
}

export interface Course {
  id: string;
  institute_id: string;
  title: string;
  slug: string;
  summary: string;
  fee_amount: number;
  approval_status: ApprovalStatus;
  rejection_reason?: string | null;
}
