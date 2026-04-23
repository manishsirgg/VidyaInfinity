import { z } from "zod";

export const leadContactPreferenceSchema = z.enum(["email", "whatsapp", "both"]);

export const leadSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  instituteId: z.string().uuid().optional(),
  courseId: z.string().uuid(),
  leadTarget: z.enum(["course", "webinar"]).default("course"),
  source: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  message: z.string().max(500).optional(),
  contactPreference: leadContactPreferenceSchema,
}).superRefine((value, ctx) => {
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
