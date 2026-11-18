import Link from "next/link";

import { ServiceInquiryForm } from "@/components/forms/service-inquiry-form";
import { siteConfig } from "@/lib/constants/site";
import { getLatestGoogleReviews } from "@/lib/integrations/google-place-reviews";
import { shouldHideReviewOnWebsite } from "@/lib/integrations/google-business-automation";

const FALLBACK_GOOGLE_REVIEW_LINK = "https://share.google/8UKyWpncuwCF5z2rR";

export default async function ContactPage() {
  const googleReviews = await getLatestGoogleReviews();
  const reviewListingUrl = googleReviews.ok ? (googleReviews.url ?? FALLBACK_GOOGLE_REVIEW_LINK) : FALLBACK_GOOGLE_REVIEW_LINK;
  const visibleReviews =
    googleReviews.ok
      ? googleReviews.reviews.filter((review) => !shouldHideReviewOnWebsite(review.text, review.rating))
      : [];
  const reviewSummary = googleReviews.ok
    ? `${googleReviews.placeName ?? "Google Reviews"} · ${googleReviews.rating?.toFixed(1) ?? "0.0"}★ (${googleReviews.totalRatings ?? 0} reviews)`
    : null;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-12 md:grid-cols-[1.2fr,1fr]">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold">Contact & Guidance</h1>
        <p className="text-slate-600">
          Share your requirement and our counsellors will support you with personalised guidance for admissions,
          career planning, visa assistance, and more.
        </p>

        <div className="rounded-xl border bg-white p-5 text-sm leading-6 text-slate-700">
          <p className="text-base font-semibold text-slate-900">Vidya Infinity</p>
          <p>
            Website:{" "}
            <Link href="https://vidyainfinity.com" className="font-medium text-brand-700 hover:underline">
              https://vidyainfinity.com
            </Link>
          </p>
          <p>
            Email:{" "}
            <Link href={`mailto:${siteConfig.email}`} className="font-medium text-brand-700 hover:underline">
              {siteConfig.email}
            </Link>
          </p>
          <p>
            WhatsApp / Call:{" "}
            <Link href="tel:+917828199500" className="font-medium text-brand-700 hover:underline">
              {siteConfig.phone}
            </Link>
          </p>
          <p>Subsidiary: Infinity Global Advisory</p>
          <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
            <div className="flex gap-3 py-3">
              <span aria-hidden="true" className="text-brand-700">📍</span>
              <div>
                <h2 className="font-semibold text-slate-900">Noida Office</h2>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(siteConfig.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand-700 hover:underline"
                  aria-label="View Noida office directions on Google Maps"
                >
                  {siteConfig.address}, India
                </a>
              </div>
            </div>
            <div className="flex gap-3 py-3">
              <span aria-hidden="true" className="text-brand-700">📍</span>
              <div>
                <h2 className="font-semibold text-slate-900">Indore Office</h2>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=C.S.%20Residency%2C%20525%2C%20MR-6%2C%20Mahalaxmi%20Nagar%2C%20Indore%2C%20Madhya%20Pradesh%20452010%2C%20India"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand-700 hover:underline"
                  aria-label="View Indore office directions on Google Maps"
                >
                  C.S. Residency, 525, MR-6, Mahalaxmi Nagar, Indore, Madhya Pradesh 452010, India
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Latest Google Reviews</h2>
            <Link
              href={reviewListingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              View all
            </Link>
          </div>

          {visibleReviews.length ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                {reviewSummary}
              </p>
              {visibleReviews.map((review, index) => (
                <article key={`${review.authorName}-${index}`} className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p className="font-semibold text-slate-900">{review.authorName}</p>
                    <p className="text-slate-600">
                      {"★".repeat(review.rating)}
                      <span className="ml-2">{review.relativeTimeDescription}</span>
                    </p>
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{review.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {googleReviews.ok
                ? "No recent review snippets are available right now. You can still read all reviews on Google."
                : "Live Google reviews are temporarily unavailable. You can still read all reviews on Google."}
            </p>
          )}
        </div>
      </section>

      <ServiceInquiryForm />
    </div>
  );
}
