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

  const body = (await request.json()) as AutomationRequest;

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
