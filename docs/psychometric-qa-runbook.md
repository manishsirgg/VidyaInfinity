# Psychometric QA Runbook (Sandbox Razorpay)

## 1) Dev test data setup
1. Apply latest migrations.
2. Run dev seed manually (never auto-run in production):
   - `psql < supabase/seed_psychometric_dev.sql`
3. Confirm test slug exists: `career-orientation-baseline`.

## 2) Sandbox purchase and attempt flow
1. Login as student.
2. Open `/psychometric-tests/career-orientation-baseline`.
3. Create Razorpay order and complete sandbox payment.
4. Verify redirect to success/pending then `/dashboard/psychometric`.
5. Start attempt, answer questions (all types), verify autosave status.
6. Submit attempt and verify redirect to report page.
7. Download PDF.

## 3) Admin reconciliation
1. Login as admin.
2. Open `/admin/psychometric-diagnostics`.
3. Click **Run reconcile**.
4. Re-open student dashboard and verify status/report consistency.

## 4) Expected DB rows by table

### After order create
- `psychometric_orders`: row with `payment_status='created'`, `test_id`, `user_id`, `razorpay_order_id`.

### After payment verify
- `psychometric_orders`: same row transitions to paid state (`paid_at` set).
- `test_attempts`: row created or upserted for user + test.

### During autosave
- `psychometric_answers`: one row per answered question keyed by `attempt_id + question_id`.

### After submit
- `test_attempts`: `status='completed'` and `report_id` populated (or backfilled by reconciliation).
- `psychometric_reports`: row exists with totals, dimensions, and narrative fields.

## 5) Legacy recovery checks
- paid order + missing attempt => dashboard shows start CTA.
- completed attempt + missing `report_id` + existing report row => dashboard/report resolve via fallback.
- legacy `legacy_report_url` with no `psychometric_reports` row => legacy report action still visible.
