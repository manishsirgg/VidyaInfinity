# Vidya Infinity – Global Education Architects

Production-oriented Next.js App Router foundation for an education marketplace + consultancy platform with Supabase and Razorpay.

## Architecture Summary

- **Framework**: Next.js App Router with TypeScript + Tailwind.
- **Data/Auth**: Supabase via server and browser clients.
- **Payments**: Razorpay order creation + signature verification route handlers for courses and psychometric tests.
- **Role Areas**: Public, Student, Institute, Admin route structure.
- **Integrations**: OneSignal script setup, WhatsApp floating CTA, newsletter API flow.

## Main Route Groups

- `/` home
- `/courses`, `/courses/[slug]`
- `/institutes`, `/institutes/[slug]`
- `/psychometric-tests`, `/psychometric-tests/[slug]`
- `/blogs`, `/blogs/[slug]`
- `/contact`, `/about`, `/services`, `/privacy-policy`, `/terms-of-service`
- `/auth/login`, `/auth/register/student`, `/auth/register/institute`
- `/student/*`, `/institute/*`, `/admin/*`
- `/api/newsletter/subscribe`
- `/api/leads`
- `/api/service-inquiries`
- `/api/payments/course/create-order`
- `/api/payments/course/verify`
- `/api/payments/test/create-order`
- `/api/payments/test/verify`

## Known Schema Assumptions / Potential Mismatches

The provided DB concept list did not explicitly mention these tables used for production payment flow:

- `platform_settings` (commission percentage)
- `course_transactions` (course-level payment + commission ledger)
- `test_purchases` (psychometric payment ledger)

If your Supabase instance uses different names, map these query targets before deployment.

## Setup

```bash
npm install
npm run dev
```

## Security Notes

- Payment verification is server-side using Razorpay signature HMAC verification.
- Public listing pages only query approved/published records.
- Dashboard routes use role-aware guards with server redirects.
