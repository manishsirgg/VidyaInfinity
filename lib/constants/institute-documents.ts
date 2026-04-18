export const INSTITUTE_APPROVAL_DOCUMENT_OPTIONS = [
  { label: "Registration Certificate", value: "registration_certificate" },
  { label: "Accreditation Letter", value: "accreditation_letter" },
  { label: "Board Resolution / Authorization", value: "board_resolution_authorization" },
  { label: "Government Approval Document", value: "government_approval_document" },
] as const;

export type InstituteApprovalDocumentSubtype = (typeof INSTITUTE_APPROVAL_DOCUMENT_OPTIONS)[number]["value"];

const INSTITUTE_APPROVAL_SUBTYPE_LABEL_MAP: Record<InstituteApprovalDocumentSubtype, string> = {
  registration_certificate: "Registration Certificate",
  accreditation_letter: "Accreditation Letter",
  board_resolution_authorization: "Board Resolution / Authorization",
  government_approval_document: "Government Approval Document",
};

const INSTITUTE_APPROVAL_SUBTYPE_SET = new Set<string>(INSTITUTE_APPROVAL_DOCUMENT_OPTIONS.map((option) => option.value));

export function isInstituteApprovalDocumentSubtype(value: string): value is InstituteApprovalDocumentSubtype {
  return INSTITUTE_APPROVAL_SUBTYPE_SET.has(value);
}

export function getInstituteApprovalSubtypeLabel(subtype: string | null | undefined) {
  if (!subtype) return "Approval";
  if (isInstituteApprovalDocumentSubtype(subtype)) {
    return INSTITUTE_APPROVAL_SUBTYPE_LABEL_MAP[subtype];
  }

  return subtype
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
