import { z } from "zod";

export const leadContactPreferenceSchema = z.enum(["email", "whatsapp", "both"]);

export const leadSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  instituteId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  webinarId: z.string().uuid().optional(),
  leadType: z.enum(["course", "webinar"]).optional(),
  leadTarget: z.enum(["course", "webinar"]).optional(),
  source: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  message: z.string().max(500).optional(),
  contactPreference: leadContactPreferenceSchema,
}).superRefine((value, ctx) => {
  const leadType = value.leadType ?? value.leadTarget ?? "course";

  if (leadType === "course" && !value.courseId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["courseId"],
      message: "Course id is required for course leads.",
    });
  }

  if (leadType === "course" && value.webinarId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["webinarId"],
      message: "Webinar id must be empty for course leads.",
    });
  }

  if (leadType === "webinar" && !value.webinarId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["webinarId"],
      message: "Webinar id is required for webinar leads.",
    });
  }

  if (leadType === "webinar" && value.courseId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["courseId"],
      message: "Course id must be empty for webinar leads.",
    });
  }

  if (value.contactPreference === "email" || value.contactPreference === "both") {
    if (!value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Email is required.",
      });
    } else if (!z.string().email().safeParse(value.email).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Enter a valid email address.",
      });
    }
  }

  if (value.contactPreference === "whatsapp" || value.contactPreference === "both") {
    if (!value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "WhatsApp/contact number is required.",
      });
    } else if (value.phone.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Enter a valid phone/WhatsApp number.",
      });
    }
  }
});

export const newsletterSchema = z.object({
  email: z.string().email(),
});

export const serviceInquirySchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  inquiryType: z.enum([
    "Career Guidance",
    "Admission Support",
    "Visa Assistance",
    "Other Support / Query",
  ]),
  message: z.string().max(500).optional(),
});
