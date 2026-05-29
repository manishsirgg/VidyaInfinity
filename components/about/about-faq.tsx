"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

const faqs = [
  {
    question: "Is institute onboarding free?",
    answer:
      "Yes. Institute registration and onboarding on Vidya Infinity are currently free. Institutes can create a profile and list courses without any upfront onboarding cost.",
  },
  {
    question: "Who can register on Vidya Infinity?",
    answer:
      "Academies, coaching institutes, colleges, universities, skill development centers, training institutes, online education providers, career counselling organizations, test preparation centers, and professional course providers can register.",
  },
  {
    question: "Can Vidya Infinity help us create our profile and listings?",
    answer:
      "Yes. If your team is busy, you can share your institute details, course details, brochure, images, and contact information. The Vidya Infinity team can help create your profile and course listings.",
  },
  {
    question: "How does Vidya Infinity help with leads?",
    answer:
      "Vidya Infinity allows institutes to receive student inquiries through lead forms and manage them through a built-in CRM system with notes, follow-ups, lead records, and tracking support.",
  },
  {
    question: "Can students pay and enroll through Vidya Infinity?",
    answer:
      "Where applicable, students can use the Pay & Enroll system to enroll directly in listed courses through the platform.",
  },
  {
    question: "Does Vidya Infinity guarantee admissions?",
    answer:
      "Vidya Infinity helps improve visibility, course discovery, lead generation, and inquiry management. Actual enrollment depends on course demand, pricing, location, student interest, institute response time, and follow-up quality.",
  },
] as const;

export function AboutFaq() {
  const [openIndex, setOpenIndex] = useState(0);
  const baseId = useId();

  return (
    <div className="space-y-4">
      {faqs.map((faq, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={faq.question}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-100 hover:shadow-md"
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${baseId}-faq-panel-${index}`}
              id={`${baseId}-faq-button-${index}`}
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
            >
              <span className="text-base font-semibold text-slate-950">
                {faq.question}
              </span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-brand-600 transition ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            <div
              id={`${baseId}-faq-panel-${index}`}
              role="region"
              aria-labelledby={`${baseId}-faq-button-${index}`}
              className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden">
                <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600 sm:px-6 sm:text-base">
                  {faq.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
