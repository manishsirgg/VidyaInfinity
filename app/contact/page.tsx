import Link from "next/link";

import { ServiceInquiryForm } from "@/components/forms/service-inquiry-form";
import { siteConfig } from "@/lib/constants/site";
import { shouldHideReviewOnWebsite } from "@/lib/integrations/google-business-automation";

type GooglePlaceReview = {
  author_name: string;
  rating: number;
  relative_time_description: string;
  text: string;
};

type GooglePlaceDetailsResponse = {
  result?: {
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    url?: string;
    reviews?: GooglePlaceReview[];
  };
  status: string;
  error_message?: string;
};

const FALLBACK_GOOGLE_REVIEW_LINK = "https://share.google/8UKyWpncuwCF5z2rR";

async function getLatestGoogleReviews() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const placeId = process.env.GOOGLE_BUSINESS_PLACE_ID;

  if (!apiKey || !placeId) {
    return null;
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "name,rating,user_ratings_total,reviews,url",
    reviews_sort: "newest",
    key: apiKey,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`, {
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GooglePlaceDetailsResponse;

  if (data.status !== "OK" || !data.result) {
    return null;
  }

  return {
    name: data.result.name,
    rating: data.result.rating,
    totalRatings: data.result.user_ratings_total,
    url: data.result.url,
    reviews: data.result.reviews?.slice(0, 3) ?? [],
  };
}

export default async function ContactPage() {
  const googleReviews = await getLatestGoogleReviews();
  const visibleReviews = googleReviews?.reviews.filter((review) => !shouldHideReviewOnWebsite(review.text, review.rating)) ?? [];

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
          <p>Address: {siteConfig.address}</p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Latest Google Reviews</h2>
            <Link
              href={googleReviews?.url ?? FALLBACK_GOOGLE_REVIEW_LINK}
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
                {googleReviews?.name} · {googleReviews?.rating?.toFixed(1)}★ ({googleReviews?.totalRatings ?? 0} reviews)
              </p>
              {visibleReviews.map((review, index) => (
                <article key={`${review.author_name}-${index}`} className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <p className="font-semibold text-slate-900">{review.author_name}</p>
                    <p className="text-slate-600">
                      {"★".repeat(review.rating)}
                      <span className="ml-2">{review.relative_time_description}</span>
                    </p>
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{review.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Live Google reviews are available when Google Places API credentials are configured. You can still read all
              reviews on Google.
            </p>
          )}
        </div>
      </section>

      <ServiceInquiryForm />
    </div>
  );
}
