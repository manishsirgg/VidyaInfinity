export const CRM_CONTACT_STAGES = ["new", "contacted", "qualified", "converted", "lost"] as const;
export const CRM_CONTACT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const CRM_FOLLOW_UP_STATUSES = ["scheduled", "completed", "cancelled"] as const;
export const CRM_FOLLOW_UP_CHANNELS = ["call", "email", "whatsapp", "sms", "meeting", "other"] as const;
export const CRM_NOTE_TYPES = ["general", "call", "meeting", "internal"] as const;
export const CRM_ACTIVITY_TYPES = ["lead_created", "status_changed", "priority_changed", "assignment_changed", "note_added", "follow_up_created", "follow_up_completed", "follow_up_cancelled", "follow_up_updated", "tags_updated", "contact_updated"] as const;

export const CRM_ENUM_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", qualified: "Qualified", converted: "Converted", lost: "Lost",
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
  scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled",
  call: "Call", email: "Email", whatsapp: "WhatsApp", sms: "SMS", meeting: "Meeting", other: "Other",
  general: "General", internal: "Internal",
  lead_created: "Lead Created", status_changed: "Status Changed", priority_changed: "Priority Changed", assignment_changed: "Assignment Changed", note_added: "Note Added", follow_up_created: "Follow-up Created", follow_up_completed: "Follow-up Completed", follow_up_cancelled: "Follow-up Cancelled", follow_up_updated: "Follow-up Updated", tags_updated: "Tags Updated", contact_updated: "Contact Updated",
};

export function crmLabel(value?: string | null) {
  if (!value) return "—";
  return CRM_ENUM_LABELS[value] ?? value;
}
