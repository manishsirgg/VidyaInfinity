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

## Level 2 hardening update (2026-05-16)

### Admin critical wrapper
- Added `notifyAdminCritical()` server-only helper at `lib/notifications/admin-critical.ts`.
- Resolves active admin profiles (`profiles.role='admin' and is_active=true`).
- Non-blocking, structured logs on recipient resolution and insert failures.
- Supports category, priority, deep-link target, metadata, entity, and dedupe key.

### Deep-link standardization
- Added centralized role-safe helper `lib/notifications/links.ts`.
- Replaced new payout and psychometric call-sites to use standardized routes.

### Psychometric notification hardening
- Added deduped student unlock notification in paid finalization flow:
  - `psychometric-test-unlocked:{orderId}`
- Added deduped report-ready student notification in submit/report flow:
  - `psychometric-report-ready:{reportId}`
- Added admin-critical alerts for psychometric finalization/report generation failure paths.

### Payout lifecycle notification hardening
- Added institute payout-request-submitted notification:
  - `payout-request-submitted:{requestId}`
- Added admin new payout request alert:
  - `admin:payout-request-submitted:{requestId}`
- Added institute status notifications in transition route for approved/processing/paid/failed/rejected/cancelled.
- Added admin-critical alerts for transition failure and consistency guard failures:
  - `admin:payout-transition-failed:{requestId}:{targetStatus}`

### Dedupe coverage updates
- Already deduped: centralized notification service supports `(user_id, dedupe_key)` conflict-safe inserts.
- Newly deduped:
  - Psychometric unlock/report-ready.
  - Institute payout request lifecycle statuses.
  - Admin payout request submission and transition failure alerts.
- Intentionally not deduped:
  - One-off admin/manual notifications where duplicate risk is not from retried background/webhook flows.

### Files changed
- `lib/notifications/admin-critical.ts`
- `lib/notifications/links.ts`
- `lib/payments/psychometric-finalize.ts`
- `app/api/psychometric/attempts/[attemptId]/submit/route.ts`
- `app/api/institute/payout-request/route.ts`
- `app/api/admin/payout-requests/[id]/transition/route.ts`
- `docs/audits/notification_integrity_diagnostics.sql`
- `docs/audits/notification-system-audit-2026-05-16.md`

### Tests run
- `npm run -s lint`
- `npm run -s typecheck`
- `npm run -s build`

### Remaining recommendations
- Expand admin-critical wiring into all course/webinar/refund/featured reconciliation failure paths.
- Add lightweight automated tests once notification/unit test harness is available in the project.

## Level 2.1 featured payment notification target_url patch (2026-05-16)

### Issue found
- Legacy featured payment notifications for course/webinar promotion lifecycle had `target_url = null` for admin and institute recipients.
- Affected patterns included:
  - `Course featuring payment initiated`
  - `Course featuring activated`
  - `Course featuring scheduled`
  - `Webinar promotion payment initiated`
  - `Webinar promotion activated`
  - `Webinar promotion scheduled`

### Source fix (future notifications)
- Updated featured notification emitter to always set target URLs:
  - Admin recipients → `/admin/featured-reconciliation`
  - Institute recipients → `/institute/featured`
- Fix is additive and preserves existing recipient, title/message, and dedupe behavior.

### Legacy backfill
- Added idempotent migration to backfill null/blank target URLs for legacy featured payment notifications only.
- Scope is restricted to `public.notifications` joined with `public.profiles` for roles `admin` and `institute`, with `category='payment'` and `type='payment'`.
- Backfill sets:
  - Admin → `/admin/featured-reconciliation`
  - Institute → `/institute/dashboard`
- No changes for student recipients, non-payment notifications, or rows that already had `target_url`.

### Integrity status
- Recipient integrity: no issues found.
- Dedupe integrity: no issues found.
- Expiry integrity: no issues found.
- Featured target_url legacy gap: fixed for future creation and covered by migration for historical rows.
