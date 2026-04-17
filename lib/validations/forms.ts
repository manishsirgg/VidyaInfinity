import { z } from "zod";

export const leadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  courseId: z.string().uuid(),
  message: z.string().max(500).optional(),
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
