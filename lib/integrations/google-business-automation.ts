import "server-only";

import { siteConfig } from "@/lib/constants/site";

export type ReviewSentiment = "positive" | "neutral" | "negative";

export type GoogleReviewInput = {
  reviewId: string;
  reviewerName?: string;
  rating?: number;
  comment: string;
  createdAt?: string;
};

export type GoogleAutomationAction =
  | {
      type: "reply_review";
      reviewId: string;
      sentiment: ReviewSentiment;
      message: string;
    }
  | {
      type: "hide_review_on_website";
      reviewId: string;
      reason: string;
    }
  | {
      type: "create_seo_post";
      title: string;
      summary: string;
      ctaUrl: string;
      topic: string;
      idempotencyKey: string;
    };

const DEFAULT_NEGATIVE_KEYWORDS = [
  "bad",
  "worst",
  "fraud",
  "fake",
  "scam",
  "poor",
  "delay",
  "complaint",
  "not recommend",
  "refund",
  "disappointed",
  "negative",
  "rude",
  "unprofessional",
  "terrible",
  "awful",
];

const DEFAULT_POSITIVE_KEYWORDS = [
  "great",
  "excellent",
  "helpful",
  "best",
  "amazing",
  "recommended",
  "supportive",
  "professional",
  "thank you",
  "satisfied",
  "good",
  "awesome",
];

const DEFAULT_REPLY_KEYWORDS = [
  "visa",
  "admission",
  "career",
  "counselling",
  "counseling",
  "study",
  "university",
  "college",
  "abroad",
  "loan",
  "scholarship",
];

const DEFAULT_SEO_TOPICS = [
  "study abroad guidance",
  "career counselling after 12th",
  "visa success tips for students",
  "education loan and scholarship planning",
  "how to choose the right university",
];

function parseKeywordEnv(value: string | undefined, fallback: string[]) {
  if (value === undefined) return fallback;
  if (!value.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function hasKeyword(comment: string, keywords: string[]) {
  const normalized = comment.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function getAutomationConfig() {
  const rawPostInterval = Number(process.env.GBP_SEO_POST_INTERVAL_HOURS ?? "72");
  const postIntervalHours = Number.isFinite(rawPostInterval) ? rawPostInterval : 72;

  return {
    negativeKeywords: parseKeywordEnv(process.env.GBP_NEGATIVE_KEYWORDS, DEFAULT_NEGATIVE_KEYWORDS),
    positiveKeywords: parseKeywordEnv(process.env.GBP_POSITIVE_KEYWORDS, DEFAULT_POSITIVE_KEYWORDS),
    replyKeywords: parseKeywordEnv(process.env.GBP_REPLY_KEYWORDS, DEFAULT_REPLY_KEYWORDS),
    seoTopics: parseKeywordEnv(process.env.GBP_SEO_TOPICS, DEFAULT_SEO_TOPICS),
    replyEnabled: process.env.GBP_AUTO_REPLY_ENABLED === "true",
    hideNegativeEnabled: process.env.GBP_HIDE_NEGATIVE_ON_WEBSITE === "true",
    seoPostEnabled: process.env.GBP_SEO_POST_ENABLED === "true",
    postIntervalHours,
  };
}

export function classifyReviewSentiment(comment: string, rating?: number): ReviewSentiment {
  const config = getAutomationConfig();

  if (rating && rating <= 2) return "negative";
  if (rating && rating >= 4 && hasKeyword(comment, config.positiveKeywords)) return "positive";
  if (hasKeyword(comment, config.negativeKeywords)) return "negative";
  if (hasKeyword(comment, config.positiveKeywords)) return "positive";

  return "neutral";
}

export function shouldHideReviewOnWebsite(comment: string, rating?: number) {
  const sentiment = classifyReviewSentiment(comment, rating);
  return getAutomationConfig().hideNegativeEnabled && sentiment === "negative";
}

export function buildReplyMessage(review: GoogleReviewInput, sentiment: ReviewSentiment) {
  const name = review.reviewerName?.trim() || "there";

  if (sentiment === "negative") {
    return `Hi ${name}, we are sorry about your experience. Please contact us at ${siteConfig.email} or ${siteConfig.phone} so we can resolve this quickly. More support: https://vidyainfinity.com/contact`;
  }

  return `Hi ${name}, thank you for your feedback and trust in Vidya Infinity. For admissions and career guidance, connect with us at https://vidyainfinity.com or call ${siteConfig.phone}.`;
}

export function buildActionsForReview(review: GoogleReviewInput): GoogleAutomationAction[] {
  const config = getAutomationConfig();
  const sentiment = classifyReviewSentiment(review.comment, review.rating);
  const actions: GoogleAutomationAction[] = [];

  if (config.hideNegativeEnabled && sentiment === "negative") {
    actions.push({
      type: "hide_review_on_website",
      reviewId: review.reviewId,
      reason: "Negative sentiment matched keyword/rating rules",
    });
  }

  const shouldReply =
    config.replyEnabled && (hasKeyword(review.comment, config.replyKeywords) || sentiment !== "neutral");

  if (shouldReply) {
    actions.push({
      type: "reply_review",
      reviewId: review.reviewId,
      sentiment,
      message: buildReplyMessage(review, sentiment),
    });
  }

  return actions;
}

function pickSeoTopic(seed: number, topics: string[]) {
  return topics[seed % topics.length] ?? DEFAULT_SEO_TOPICS[0];
}

export function buildScheduledSeoAction(now = new Date()): GoogleAutomationAction | null {
  const config = getAutomationConfig();
  if (!config.seoPostEnabled || config.postIntervalHours <= 0) {
    return null;
  }

  const epochHours = Math.floor(now.getTime() / (1000 * 60 * 60));
  if (epochHours % config.postIntervalHours !== 0) {
    return null;
  }

  const topic = pickSeoTopic(epochHours, config.seoTopics);
  const dateKey = now.toISOString().slice(0, 13);

  return {
    type: "create_seo_post",
    title: `Career & Education Tips: ${topic}`,
    summary: `Explore practical guidance on ${topic}. Connect with Vidya Infinity for personalized admissions, visa, and career support.`,
    ctaUrl: "https://vidyainfinity.com/contact",
    topic,
    idempotencyKey: `seo-post-${dateKey}-${topic.replace(/\s+/g, "-")}`,
  };
}

export async function dispatchGoogleAutomationActions(actions: GoogleAutomationAction[]) {
  const webhook = process.env.GBP_AUTOMATION_WEBHOOK_URL;

  if (!webhook) {
    return {
      ok: false as const,
      error: "GBP_AUTOMATION_WEBHOOK_URL is not configured",
      sent: 0,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const token = process.env.GBP_AUTOMATION_WEBHOOK_TOKEN?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(webhook, {
      method: "POST",
      headers,
      body: JSON.stringify({ actions }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false as const,
        error: body.slice(0, 300) || "Webhook responded with non-success status",
        sent: 0,
      };
    }

    return {
      ok: true as const,
      sent: actions.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook dispatch error";
    return {
      ok: false as const,
      error: message,
      sent: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}
