# Vidya Infinity Production-Readiness QA Audit (2026-04-25)

## Scope & execution summary

Static production-readiness audit completed across:
- Core logic and route guards
- Supabase table/column expectations in runtime code
- Payments (course, webinar, featured listings, psychometric)
- Payout lifecycle and wallet reconciliation surface
- Student/institute/admin dashboard metrics
- Role and RLS-sensitive access patterns

Executed checks:
- `npm run typecheck` ✅
- `npm run lint` ✅ (warnings only)
- `npm run build` ✅
- `npm run check:no-legacy-user-verification-table` ✅
- `npm run check:conflicts` ✅

## Environment limitations (critical for interpretation)

1. No live Supabase credentials were available in this audit environment, so table/column/RPC checks were validated by code-path and migration analysis, not against a running DB.
2. No Razorpay test secrets/webhook endpoint was configured here, so gateway callbacks/webhook replay and signature mismatch were audited statically only.
3. No existing Playwright/Cypress test harness existed; a new Playwright suite has been added in this branch for top journeys.

---

## Critical blockers

### 1) Lead routing allows client-supplied `instituteId` to override server-derived ownership
- **Area:** lead capture / CRM integrity
- **Impact:** data integrity risk and cross-institute misattribution in lead rows + CRM metadata.
- **Evidence:** `leads` insert payload and CRM metadata use `payload.data.instituteId ?? (course?.institute_id ?? webinar?.institute_id ?? null)` instead of forcing server-derived institute id from resolved course/webinar. 
- **Files:**
  - `app/api/leads/route.ts`
- **Why this is critical:** any public client can submit a valid course/webinar id but attach a different institute UUID, poisoning analytics and potentially notifications/ownership flows that consume `leads.institute_id`.
- **Safe fix direction:** ignore `payload.data.instituteId` for persistence; always persist server-resolved institute id from validated course/webinar.

---

## High-risk bugs

### 2) Payout account create/update validation is permissive and can persist structurally invalid account records
- **Area:** payout readiness and payout failure risk
- **Impact:** institutes can store incomplete bank/UPI account payloads that pass API layer and fail later at payout processing time.
- **Evidence:** account creation validates `account_type` only; missing strict conditional checks (e.g., `bank` requires account number + IFSC; `upi` requires UPI id). PATCH path similarly accepts weakly typed updates.
- **Files:**
  - `app/api/institute/payout-accounts/route.ts`
  - `app/api/institute/payout-accounts/[id]/route.ts`
- **Safe fix direction:** add request schema validation (Zod) with strict account-type dependent rules and input normalization.

### 3) Dashboard revenue/paid counts use exact `"paid"` in places while payment logic treats multiple success states
- **Area:** reporting consistency
- **Impact:** undercounting paid orders/revenue depending on status normalization drift (`captured`, `success`, `confirmed` already treated as successful in payment pipelines).
- **Evidence:** course payment flow defines multi-status success set, but dashboard aggregations often filter only `payment_status === "paid"`.
- **Files:**
  - `app/api/payments/course/create-order/route.ts` (canonical success set)
  - `app/student/dashboard/page.tsx`
  - `app/institute/dashboard/page.tsx`
  - `app/admin/dashboard/page.tsx`
- **Safe fix direction:** introduce shared canonical helper for success statuses and reuse in dashboards.

---

## Medium issues

### 4) Public webinar listing route repeats `is_deleted` predicate
- **Area:** query hygiene / maintainability
- **Impact:** low runtime impact but indicates duplicated filter construction and drift risk in future edits.
- **File:** `app/api/webinars/route.ts`
- **Safe fix direction:** remove duplicated predicate and keep single source of filter clause.

### 5) Schema guard verifies presence of required columns but not enum values/RPC contracts
- **Area:** migration safety
- **Impact:** code can pass schema guard while still failing on enum/status/RPC signature mismatch at runtime.
- **File:** `lib/supabase/schema-guard.ts`
- **Safe fix direction:** add optional RPC existence checks + enum compatibility assertions (querying `pg_type`/`pg_enum` through secured RPC or migration-time smoke tests).

### 6) Route-level validation is inconsistent across APIs
- **Area:** API hardening
- **Impact:** inconsistent error shape and hidden 500s on malformed JSON payloads in some routes.
- **Evidence:** some routes use strict schemas (`leadSchema`), while many payment/payout/admin routes cast `await request.json()` directly.
- **Files (examples):**
  - `app/api/payments/course/verify/route.ts`
  - `app/api/admin/payout-requests/[id]/transition/route.ts`
  - `app/api/institute/payout-request/route.ts`
- **Safe fix direction:** shared request validators per domain + consistent error envelopes.

---

## Low-priority cleanup

1. Next lint warnings for `<img>` usage in several pages (performance, not correctness).
2. Add explicit regression/e2e commands in scripts and CI jobs (currently absent).
3. Expand audit docs with explicit status vocab matrix (order/payment/refund/payout/registration).

---

## Role-flow & auth audit summary

- **Student-only** payment routes correctly call `requireApiUser("student", ...)`.
- **Institute-only** payout/featured routes generally derive institute id from authenticated user, not request body.
- **Admin-only** moderation/payout transitions consistently use `requireApiUser("admin")`.
- **Public routes** (`/api/webinars`, `/api/webinars/[id]`, `/api/leads`, `/api/service-inquiries`) intentionally allow unauthenticated access.

Potential trust boundary note:
- Public lead endpoint currently trusts optional client institute id for persistence (critical item #1).

---

## RLS-sensitive flow audit summary

Service-role/admin client is correctly required for:
- Payment reconciliation and webhook handling
- Cross-table writes (orders + transactions + enrollments/registrations)
- Admin payout/review transitions
- Notifications fanout to other users

Risk note:
- Public read endpoints use admin client when available; filters are present, but this pattern should be documented as intentional because it bypasses RLS and relies fully on query predicates.

---

## Payment/webhook flow findings

### Course/webinar/psychometric order create/verify
- Defensive checks are largely strong (ownership checks, signature validation, amount/currency matching, idempotent reconciliation).

### Razorpay webhook
- Duplicate-event guard exists via webhook log table lookup.
- Signature verification path is explicit with invalid-signature short-circuit.
- Refund reconciliation has mapping fallback by refund id and processing payment id.

### Gaps to cover in automated tests
- Duplicate webhook replay safety per event type
- Signature mismatch path
- Refund processed/failed transitions
- Cross-check between webhook and verify API races

---

## Dashboard and wallet/payout consistency summary

- Dashboard data loads are broad and mostly scoped by authenticated identity.
- Wallet summary derives from `loadInstituteWalletSnapshot`, which composes view + ledger + request-based reconciliation.
- Main consistency risk is status vocabulary drift (`paid` vs other successful aliases) in UI counts.

---

## Suggested safe patch plan (small batches)

### Batch A (highest safety, immediate)
1. Fix lead persistence to always use server-derived institute id.
2. Add unit-level assertions in API handler for mismatched payload instituteId (log and ignore).

### Batch B
1. Add strict Zod validation for payout account create/update.
2. Add user-facing validation messages for bank/UPI requirements.

### Batch C
1. Introduce shared `isSuccessfulPaymentStatus` helper.
2. Refactor dashboard aggregations to use shared helper.

### Batch D
1. Add API integration tests for payment + payout transition routes.
2. Add webhook simulation tests for success/failure/duplicate/refund/signature mismatch.

### Batch E
1. Document enum/status matrix and required RPC contracts in `docs/`.
2. Add CI checks for e2e smoke run in test mode.

