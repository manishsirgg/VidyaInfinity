import "server-only";

export type GooglePlaceReview = {
  authorName: string;
  rating: number;
  relativeTimeDescription: string;
  text: string;
};

export type GooglePlaceReviewFetchResult =
  | {
      ok: true;
      placeName: string | null;
      rating: number | null;
      totalRatings: number | null;
      url: string | null;
      reviews: GooglePlaceReview[];
    }
  | {
      ok: false;
      reason: "missing_config" | "google_api_error" | "network_error";
    };

type GooglePlaceDetailsResponse = {
  result?: {
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    url?: string;
    reviews?: Array<{
      author_name?: string;
      rating?: number;
      relative_time_description?: string;
      text?: string;
    }>;
  };
  status?: string;
  error_message?: string;
};

function resolvePlaceId(rawPlaceId: string) {
  const input = rawPlaceId.trim();
  if (!input) return "";
  if (input.startsWith("place_id:")) return input.slice("place_id:".length).trim();

  const placeIdMatch = input.match(/[?&]place_id=([^&]+)/i);
  if (placeIdMatch?.[1]) {
    return decodeURIComponent(placeIdMatch[1]);
  }

  return input;
}

function normalizeReview(review: {
  author_name?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
}): GooglePlaceReview | null {
  if (!review.text?.trim()) return null;
  const rating = typeof review.rating === "number" && Number.isFinite(review.rating) ? Math.round(review.rating) : 0;

  return {
    authorName: review.author_name?.trim() || "Google user",
    rating: Math.max(0, Math.min(5, rating)),
    relativeTimeDescription: review.relative_time_description?.trim() || "Recently",
    text: review.text.trim(),
  };
}

export async function getLatestGoogleReviews(): Promise<GooglePlaceReviewFetchResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  const rawPlaceId = process.env.GOOGLE_BUSINESS_PLACE_ID?.trim();
  const placeId = rawPlaceId ? resolvePlaceId(rawPlaceId) : "";

  if (!apiKey || !placeId) {
    return { ok: false, reason: "missing_config" };
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "name,rating,user_ratings_total,reviews,url",
    reviews_sort: "newest",
    key: apiKey,
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`, {
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) {
      return { ok: false, reason: "google_api_error" };
    }

    const data = (await response.json()) as GooglePlaceDetailsResponse;

    if (data.status !== "OK" || !data.result) {
      return { ok: false, reason: "google_api_error" };
    }

    return {
      ok: true,
      placeName: data.result.name?.trim() || null,
      rating: typeof data.result.rating === "number" ? data.result.rating : null,
      totalRatings: typeof data.result.user_ratings_total === "number" ? data.result.user_ratings_total : null,
      url: data.result.url?.trim() || null,
      reviews: (data.result.reviews ?? []).map(normalizeReview).filter((review): review is GooglePlaceReview => review !== null).slice(0, 3),
    };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
