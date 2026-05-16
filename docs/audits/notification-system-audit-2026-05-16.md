# Notification System Audit — 2026-05-16

## Scope
End-to-end audit of notification persistence, API access control, UI surfaces, and business-flow coverage across Student, Institute, and Admin roles.

## Architecture found
- **DB table:** `public.notifications` (single-table pattern, role-agnostic by `user_id -> profiles.id`).
- **Core service:** `lib/notifications/service.ts` with dedupe support via `dedupe_key` and graceful skip for missing table.
- **Domain wrapper:** `lib/notifications/account-notifications.ts` (`createAccountNotification`).
- **Domain emitters:**
  - `lib/marketplace/course-notifications.ts`
  - `lib/webinars/enrollment-notifications.ts`
  - `lib/featured-notifications.ts`
  - payment reconciliation hooks in `lib/payments/reconcile.ts`
- **APIs:**
  - `GET/PATCH /api/notifications`
  - `PATCH /api/notifications/[id]`
- **UI pages:** role-separated pages under `/student/notifications`, `/institute/notifications`, `/admin/notifications` using shared `NotificationsCenter`.
- **Header badge:** derived from `/api/auth/me` unread count.

## Database assessment
- ✅ Base columns exist (`id`, `user_id`, `title`, `message`, `type`, `is_read`, `created_at`).
- ✅ Platform columns added by upgrade migration (`category`, `priority`, `target_url`, `action_label`, `entity_type`, `entity_id`, `metadata`, `read_at`, `dismissed_at`, `archived_at`, `created_by`, `expires_at`, `dedupe_key`).
- ✅ Indexes exist for recipient feed and unread reads.
- ✅ Dedupe unique index exists: `(user_id, dedupe_key)` where not null.
- ⚠️ No explicit `updated_at` / `deleted_at`; soft-state is handled by `archived_at` and `dismissed_at`.
- ✅ Recipient key is consistently `profiles.id` (`user_id` FK to `profiles(id)`).

## API and security assessment
- ✅ Auth enforced with `requireApiUser`.
- ✅ Fetch and mark actions are user-scoped by `eq("user_id", auth.user.id)`.
- ✅ Client cannot pass recipient IDs to read/write others.
- ✅ Admin-only moderation routes create notifications via server-side admin client.
- ⚠️ No dedicated admin-notifications API; admin uses same personal-notification feed model.

## Realtime assessment
- Notifications are currently fetch-based; correctness does not depend on realtime channels.
- This is acceptable for production reliability; realtime is optional enhancement.

## Event coverage summary
- **Covered well:** course paid/enrollment, webinar enrollment (free+paid), institute/course moderation outcomes, refund status updates, featured purchase flows, lead capture notifications.
- **Partially covered:** psychometric report-ready lifecycle (purchase confirmed exists; report-ready specific signal not centralized), payout lifecycle state notifications vary by route.
- **Missing/weak:** centralized admin-alert notifications for reconciliation/webhook/system failures; several flows still rely on logs/audit only.

## Key risks found
1. **Operational visibility gap:** critical payment/refund/reconciliation failure paths often log only, without guaranteed admin in-app alerts.
2. **Inconsistent deep links:** some notifications point to legacy or inconsistent paths (e.g., mixed purchases/transactions destinations depending on flow).
3. **Inconsistent idempotency style:** most critical flows use dedupe keys, but some helper call-sites do not pass dedupe keys.

## Fixes implemented in this audit
1. Added structured error logging in centralized notification service so failed inserts are observable without breaking business flows.
2. Preserved existing non-blocking behavior for notification failures and dedupe conflict handling.

## Recommended next hardening (no breaking changes)
1. Add `notifyAdminCritical()` wrapper for reconciliation/webhook/system-failure paths.
2. Standardize deep-link map by role and entity.
3. Add lightweight integration tests for `/api/notifications` user scoping and dedupe conflict behavior.
4. Optionally add `updated_at` trigger column for auditability.
