import Link from "next/link";

import { requireUser } from "@/lib/auth/get-session";

import { ReconcilePaidOrdersForm } from "./ReconcilePaidOrdersForm";

const verificationQueries = `-- Course conversions
select full_name, last_course_order_id, lifecycle_stage, converted, converted_at, updated_at
from public.crm_contacts
where last_course_order_id is not null
order by updated_at desc
limit 10;

-- Webinar conversions
select full_name, last_webinar_order_id, lifecycle_stage, converted, converted_at, updated_at
from public.crm_contacts
where last_webinar_order_id is not null
order by updated_at desc
limit 10;

-- Paid activities
select activity_type, title, metadata, created_at
from public.crm_activities
where metadata->>'dedupe_key' like 'course_order:%'
   or metadata->>'dedupe_key' like 'webinar_order:%'
order by created_at desc
limit 20;

-- Dedupe check
select activity_type, metadata->>'dedupe_key' as dedupe_key, count(*) as total
from public.crm_activities
where metadata ? 'dedupe_key'
group by activity_type, metadata->>'dedupe_key'
having count(*) > 1
order by total desc;`;

export default async function AdminCrmMaintenancePage() {
  await requireUser("admin");

  return (
    <div className="vi-page space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="vi-page-title">Admin CRM Maintenance</h1>
          <p className="mt-2 text-sm text-slate-600">Run safe CRM-only reconciliation tasks for paid course and webinar orders.</p>
          <p className="mt-2 text-sm text-slate-700">
            This tool only updates crm_contacts and crm_activities. It does not modify payments, orders, enrollments, payouts,
            refunds, access, or financial records.
          </p>
        </div>
        <Link href="/admin/crm" className="vi-btn-secondary whitespace-nowrap">
          Back to CRM
        </Link>
      </div>

      <ReconcilePaidOrdersForm />

      <section className="vi-card p-5">
        <h2 className="text-base font-semibold text-slate-900">Safety Notice</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Admin only.</li>
          <li>CRM-only operation.</li>
          <li>Idempotent and safe to run repeatedly.</li>
          <li>Duplicate activities are protected by dedupe keys.</li>
          <li>Use small limits first.</li>
        </ul>
      </section>

      <section className="vi-card p-5">
        <h2 className="text-base font-semibold text-slate-900">Quick verification SQL helper</h2>
        <p className="mt-2 text-sm text-slate-600">Run these read-only checks in Supabase SQL editor after reconciliation.</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">{verificationQueries}</pre>
      </section>
    </div>
  );
}
