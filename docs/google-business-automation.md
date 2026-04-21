# Google Business automation (reviews + SEO posts)

This project supports a policy-driven Google Business automation flow with safe defaults:

- **Hide negative reviews on the website** (local display policy; does not delete Google reviews).
- **Auto-generate review replies** using sentiment + keyword rules.
- **Auto-generate SEO post payloads** on interval windows.
- **Dispatch actions to your automation webhook** (Make/Zapier/n8n/custom worker) that performs actual Google Business API calls.

> Note: Google reviews cannot be arbitrarily removed by API. Removal requires Google policy violation reporting and review moderation by Google.

## Environment variables

Configure these variables:

- `GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (optional; only needed for browser-side Maps widgets)
- `GOOGLE_BUSINESS_PLACE_ID`
- `GBP_AUTOMATION_SECRET`
- `GBP_AUTOMATION_WEBHOOK_URL`
- `GBP_AUTOMATION_WEBHOOK_TOKEN`
- `GBP_AUTO_REPLY_ENABLED=true|false`
- `GBP_HIDE_NEGATIVE_ON_WEBSITE=true|false`
- `GBP_SEO_POST_ENABLED=true|false`
- `GBP_SEO_POST_INTERVAL_HOURS=72`
- `GBP_NEGATIVE_KEYWORDS=bad,worst,fraud,scam,...`
- `GBP_POSITIVE_KEYWORDS=great,excellent,helpful,...`
- `GBP_REPLY_KEYWORDS=visa,admission,career,...`
- `GBP_SEO_TOPICS=study abroad guidance,career counselling after 12th,...`

`GOOGLE_MAPS_API_KEY` is used server-side for fetching Place reviews. Keep this key private. Only set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` if you intentionally load Google Maps in client-side UI.

## Automation endpoint

`POST /api/integrations/google-business/automations`

Headers:

- `x-automation-secret: <GBP_AUTOMATION_SECRET>`

Body example:

```json
{
  "reviews": [
    {
      "reviewId": "abc123",
      "reviewerName": "John",
      "rating": 1,
      "comment": "Very bad experience with delays"
    }
  ],
  "runSeoPost": true
}
```

Response includes generated actions. Your webhook receives payload like:

```json
{
  "actions": [
    {
      "type": "hide_review_on_website",
      "reviewId": "abc123",
      "reason": "Negative sentiment matched keyword/rating rules"
    },
    {
      "type": "reply_review",
      "reviewId": "abc123",
      "sentiment": "negative",
      "message": "Hi John, we are sorry about your experience..."
    },
    {
      "type": "create_seo_post",
      "title": "Career & Education Tips: study abroad guidance",
      "summary": "Explore practical guidance...",
      "ctaUrl": "https://vidyainfinity.com/contact",
      "topic": "study abroad guidance",
      "idempotencyKey": "seo-post-..."
    }
  ]
}
```

## Suggested deployment flow

1. Cron/worker fetches latest Google reviews.
2. Worker calls this endpoint with reviews.
3. Endpoint applies keyword/sentiment policy.
4. Endpoint pushes actions to `GBP_AUTOMATION_WEBHOOK_URL`.
5. External automation performs:
   - Google review reply API calls.
   - Google local post creation.
   - Optional alerting/escalation for negative reviews.
