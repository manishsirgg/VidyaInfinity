export type PayoutRequestStatus = "requested" | "under_review" | "approved" | "processing" | "paid" | "failed" | "rejected" | "cancelled";

export type InstitutePayoutAccount = {
  id: string;
  institute_id: string;
  account_type: string;
  account_holder_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  verification_status: string | null;
  payout_mode: "manual" | "auto" | string | null;
  is_default: boolean | null;
  is_disabled: boolean | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  proof_document_signed_url?: string | null;
};

export type InstitutePayoutRequest = {
  id: string;
  institute_id: string;
  payout_account_id: string | null;
  status: PayoutRequestStatus | string | null;
  requested_amount: number | null;
  approved_amount: number | null;
  payment_reference: string | null;
  failure_reason?: string | null;
  admin_note?: string | null;
  paid_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
};
