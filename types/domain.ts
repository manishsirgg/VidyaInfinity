export type Role = "student" | "institute" | "admin";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  approval_status?: ApprovalStatus;
  avatar_url?: string | null;
}

export interface Course {
  id: string;
  institute_id: string;
  title: string;
  summary: string | null;
  fees: number;
  duration: string;
  mode: string;
  status: ApprovalStatus;
  rejection_reason?: string | null;
}
