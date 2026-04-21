import { NextResponse } from "next/server";

import {
  buildActionsForReview,
  buildScheduledSeoAction,
  dispatchGoogleAutomationActions,
  type GoogleReviewInput,
} from "@/lib/integrations/google-business-automation";

type AutomationRequest = {
  reviews?: GoogleReviewInput[];
  runSeoPost?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAutomationRequest(value: unknown): AutomationRequest {
  if (!isRecord(value)) {
    return {};
  }

  const reviews = Array.isArray(value.reviews)
    ? value.reviews.flatMap((review): GoogleReviewInput[] => {
        if (!isRecord(review)) return [];

        const reviewId = typeof review.reviewId === "string" ? review.reviewId.trim() : "";
        const comment = typeof review.comment === "string" ? review.comment.trim() : "";
        if (!reviewId || !comment) return [];

        return [
          {
            reviewId,
            comment,
            reviewerName: typeof review.reviewerName === "string" ? review.reviewerName : undefined,
            rating: typeof review.rating === "number" ? review.rating : undefined,
            createdAt: typeof review.createdAt === "string" ? review.createdAt : undefined,
          },
        ];
      })
    : undefined;

  return {
    reviews,
    runSeoPost: value.runSeoPost === true,
  };
}

function isAuthorized(request: Request) {
  const secret = process.env.GBP_AUTOMATION_SECRET;
  if (!secret) return false;

  const header = request.headers.get("x-automation-secret");
  return header === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AutomationRequest = {};
  try {
    const parsedBody = (await request.json()) as unknown;
    body = parseAutomationRequest(parsedBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reviewActions = (body.reviews ?? []).flatMap((review) => buildActionsForReview(review));
  const seoAction = body.runSeoPost ? buildScheduledSeoAction() : null;

  const actions = seoAction ? [...reviewActions, seoAction] : reviewActions;

  if (!actions.length) {
    return NextResponse.json({ ok: true, dispatched: 0, message: "No actions generated" });
  }

  const dispatched = await dispatchGoogleAutomationActions(actions);

  if (!dispatched.ok) {
    return NextResponse.json({ error: dispatched.error, dispatched: 0 }, { status: 502 });
  }

  return NextResponse.json({ ok: true, dispatched: dispatched.sent, actions });
}
