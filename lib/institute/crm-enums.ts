export const CRM_CONTACT_STAGES = ["new", "contacted", "interested", "qualified", "application_started", "payment_pending", "converted", "lost", "junk", "archived"] as const;
export const CRM_CONTACT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const CRM_FOLLOW_UP_STATUSES = ["scheduled", "completed", "cancelled", "missed"] as const;
export const CRM_FOLLOW_UP_CHANNELS = ["call", "whatsapp", "email", "sms", "meeting", "other"] as const;
export const CRM_NOTE_TYPES_ALL = ["general", "call_note", "follow_up_note", "internal", "conversion_note", "system"] as const;
export const CRM_NOTE_TYPES_USER_SELECTABLE = ["general", "call_note", "follow_up_note", "internal", "conversion_note"] as const;
export const CRM_NOTE_TYPES = CRM_NOTE_TYPES_ALL;
export const CRM_ACTIVITY_TYPES = ["contact_created", "contact_updated", "source_ingested", "status_changed", "priority_changed", "assigned", "unassigned", "note_added", "note_updated", "follow_up_created", "follow_up_completed", "follow_up_cancelled", "called", "email_sent", "whatsapp_sent", "sms_sent", "lead_created", "webinar_registered", "webinar_purchased", "course_lead_created", "course_purchased", "course_enrolled", "psychometric_purchased", "institute_registered", "profile_linked", "institute_linked", "tag_added", "tag_removed", "converted", "lost", "duplicate_marked", "duplicate_resolved", "system_note"] as const;

export const CRM_ENUM_LABELS: Record<string, string> = {
  new: "New", contacted: "Contacted", interested: "Interested", qualified: "Qualified", application_started: "Application Started", payment_pending: "Payment Pending", converted: "Converted", lost: "Lost", junk: "Junk", archived: "Archived",
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
  scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled", missed: "Missed",
  call: "Call", whatsapp: "WhatsApp", email: "Email", sms: "SMS", meeting: "Meeting", other: "Other",
  general: "General", call_note: "Call Note", follow_up_note: "Follow-up Note", internal: "Internal", conversion_note: "Conversion Note", system: "System",
  contact_created: "Contact Created", contact_updated: "Contact Updated", source_ingested: "Source Ingested", status_changed: "Status Changed", priority_changed: "Priority Changed", assigned: "Assigned", unassigned: "Unassigned", note_added: "Note Added", note_updated: "Note Updated", follow_up_created: "Follow-up Created", follow_up_completed: "Follow-up Completed", follow_up_cancelled: "Follow-up Cancelled", called: "Called", email_sent: "Email Sent", whatsapp_sent: "WhatsApp Sent", sms_sent: "SMS Sent", lead_created: "Lead Created", webinar_registered: "Webinar Registered", webinar_purchased: "Webinar Purchased", course_lead_created: "Course Lead Created", course_purchased: "Course Purchased", course_enrolled: "Course Enrolled", psychometric_purchased: "Psychometric Purchased", institute_registered: "Institute Registered", profile_linked: "Profile Linked", institute_linked: "Institute Linked", tag_added: "Tag Added", tag_removed: "Tag Removed", duplicate_marked: "Duplicate Marked", duplicate_resolved: "Duplicate Resolved", system_note: "System Note",
};

export function crmLabel(value?: string | null) {
  if (!value) return "—";
  return CRM_ENUM_LABELS[value] ?? value;
}
