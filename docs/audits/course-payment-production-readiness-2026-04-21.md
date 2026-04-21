# Course payment production-readiness audit (2026-04-21)

## Scope and method

This audit compares runtime field usage in:
- `app/api/payments/course/create-order/route.ts`
- `app/api/payments/course/verify/route.ts`
- `app/api/payments/razorpay/webhook/route.ts`
- `lib/payments/reconcile.ts`

against repository migrations in `supabase/migrations/*.sql`.

> Note: No live production database connection details were available in this environment, so this is a migration/state parity audit of the deployable schema source-of-truth.

## Findings by table

### 1) `public.course_orders`

**Runtime expects** (minimum):
- `student_id`, `course_id`, `institute_id`
- `payment_status`, `gross_amount`, `currency`
- `commission_percent`, `platform_fee_amount`, `institute_receivable_amount`
- `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`, `razorpay_receipt`
- `metadata`, `paid_at`

**Legacy migration defines**:
- `user_id` (not `student_id`)
- `commission_percentage` (not `commission_percent`)
- `platform_commission_amount` (not `platform_fee_amount`)
- missing `razorpay_receipt` and `order_kind`

**Risk:** high (create-order / verify may fail in older environments).

### 2) `public.course_enrollments`

**Runtime expects**:
- `course_order_id` (used in upsert conflict key)
- `student_id`, `course_id`, `institute_id`
- `enrollment_status`, `enrolled_at`, `access_start_at`, `metadata`

**Legacy migration touchpoint**:
- only adds `order_id` (not `course_order_id`) in payment alignment migration
- older index references `user_id`

**Risk:** high (reconciliation upsert conflict target and enrollment lookup can break).

### 3) `public.razorpay_transactions`

**Runtime expects**:
- `order_kind`, `course_order_id`, `psychometric_order_id`, `webinar_order_id`
- `user_id`, `institute_id`
- `event_type`, `payment_status`, `verified`, `verified_at`, `gateway_response`

**Migration status**:
- later migration (`20260420_000018`) adds these fields and backfills legacy columns.

**Residual risk:** medium (older envs that stopped before 000018 will drift).

### 4) `public.institute_payouts`

**Runtime expects**:
- course payout path uses `gross_amount`, `platform_fee_amount`, `payout_amount`, `scheduled_at`, `course_order_id`
- deterministic one-row lookup by `course_order_id`

**Legacy migration defines**:
- `amount_payable`, `due_at` (older naming)
- new columns added later via webinar migration, but uniqueness guarantees are not explicit for course/webinar order IDs.

**Risk:** medium (possible duplicate payouts during races without unique indexes).

### 5) `public.notifications`

**Runtime expects** (via notification service):
- baseline + advanced fields: `category`, `priority`, `target_url`, `action_label`, `entity_type`, `entity_id`, `metadata`, `read_at`, `dismissed_at`, `archived_at`, `created_by`, `expires_at`, `dedupe_key`

**Migration status**:
- advanced fields are added in `20260421_000018_notifications_platform_upgrade.sql`.

**Risk:** low in fully migrated envs; medium in partially migrated envs.

### 6) `public.coupons`

**Runtime expects**:
- `code`, `discount_percent`, `active`, `expiry_date`, `applies_to`, and optional `is_deleted`

**Repo gap**:
- no explicit coupons table-creation/alignment migration exists in this repository snapshot.

**Risk:** medium-high for older environments with preexisting coupons schema variants.

### 7) `public.platform_commission_settings`

**Runtime expects**:
- singleton row with `key='default'` and `commission_percentage`

**Migration status**:
- created and seeded in `20260417_000002`.

**Risk:** low, unless legacy DB has manually diverged.

## Index / unique / FK / enum / RLS parity summary

### Missing or at-risk indexes/constraints identified
- `course_enrollments(course_order_id)` unique (required for upsert-on-conflict reliability).
- `institute_payouts(course_order_id)` unique (prevents duplicate course payout rows).
- `institute_payouts(webinar_order_id)` unique (prevents duplicate webinar payout rows).
- legacy-only index still references `course_enrollments(user_id, course_id)`.

### Foreign key parity at risk
- `course_orders.student_id -> profiles(id)` may be absent in old envs.
- `course_enrollments.student_id -> profiles(id)` may be absent in old envs.
- `course_enrollments.course_order_id -> course_orders(id)` may be absent in old envs.

### Enums / checks
- Payment domain uses `text + check constraints`; no PostgreSQL enum dependency detected for audited tables.

### RLS
- This repository snapshot does not include explicit payment-table RLS policy migrations for the audited tables.
- Runtime mostly uses service-role admin client, so functional impact is limited, but governance hardening may still require explicit policies.

## Required SQL patch

Added migration:
- `supabase/migrations/20260421_000020_course_payment_schema_parity_patch.sql`

What it does (idempotent, no destructive drops):
- Adds/backs-fills runtime contract columns for `course_orders`.
- Adds/backs-fills `course_enrollments` runtime fields and uniqueness needed by reconciliation upserts.
- Ensures `razorpay_transactions` legacy->new field parity for partially migrated DBs.
- Hardens `institute_payouts` for idempotent payout writes.
- Ensures coupon runtime columns/indexes exist.
- Reasserts `platform_commission_settings` singleton availability.
- Ensures advanced notification columns and dedupe/feed indexes exist.

## Live smoke-test readiness matrix

After applying all migrations including parity patch:

1. **Low-value paid course**: ready (order create -> payment capture -> verify/webhook reconcile -> enrollment + payout + notifications).
2. **Zero-value/free course**: ready (create-order free path + direct reconciliation).
3. **Valid coupon flow**: ready if coupon has `applies_to='course'`, `active=true`, future `expiry_date`, positive `discount_percent`.
4. **Invalid coupon flow**: ready (scope mismatch/expired/inactive/deleted branches are explicitly handled).

## Final verdict

- **Schema parity fully correct?** Not guaranteed in older environments without the new parity patch.
- **Any SQL still needs to be run?** Yes. Run the full payment migration chain including `20260421_000020_course_payment_schema_parity_patch.sql`.
- **Ready for one live end-to-end production payment test?** **Yes, conditionally**: only after schema patch is applied and migration state is confirmed in target production DB.
- **Still-at-risk files/tables before patch:**
  - Runtime files: `app/api/payments/course/create-order/route.ts`, `app/api/payments/course/verify/route.ts`, `app/api/payments/razorpay/webhook/route.ts`, `lib/payments/reconcile.ts`
  - Tables: `course_orders`, `course_enrollments`, `institute_payouts`, `coupons` (and partially migrated `razorpay_transactions` / `notifications`)
