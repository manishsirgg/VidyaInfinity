import { requireUser } from "@/lib/auth/get-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { expireWebinarFeaturedSubscriptionsSafe } from "@/lib/webinar-featured";

function money(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

type InstituteRecord = { id: string; name: string | null };

type FeaturedOrderRecord = {
  id: string;
  institute_id: string;
  plan_id: string | null;
  amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  paid_at: string | null;
  created_at: string;
};

type FeaturedSubscriptionRecord = {
  id: string;
  institute_id: string;
  plan_code: string;
  amount: number;
  currency: string;
  status: string;
  starts_at: string;
  ends_at: string;
  queued_from_previous: boolean | null;
  order_id: string | null;
  created_at: string;
};
type CourseFeaturedOrderRecord = {
  id: string;
  institute_id: string;
  course_id: string;
  plan_id: string | null;
  amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  paid_at: string | null;
  created_at: string;
};


type WebinarFeaturedOrderRecord = {
  id: string;
  institute_id: string;
  webinar_id: string;
  plan_id: string | null;
  amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  paid_at: string | null;
  created_at: string;
};

type WebinarFeaturedSubscriptionRecord = {
  id: string;
  institute_id: string;
  webinar_id: string;
  plan_code: string | null;
  amount: number;
  currency: string;
  status: string;
  starts_at: string;
  ends_at: string;
  queued_from_previous: boolean | null;
  order_id: string | null;
  created_at: string;
};

type CourseFeaturedSubscriptionRecord = {
  id: string;
  institute_id: string;
  course_id: string;
  plan_code: string | null;
  amount: number;
  currency: string;
  status: string;
  starts_at: string;
  ends_at: string;
  queued_from_previous: boolean | null;
  order_id: string | null;
  created_at: string;
};

function summarizeSubscriptionStates<T extends { status: string }>(items: T[] | null | undefined) {
  return (items ?? []).reduce(
    (summary, item) => {
      const key = item.status?.toLowerCase();
      if (key === "active") summary.active += 1;
      else if (key === "scheduled") summary.scheduled += 1;
      else if (key === "expired") summary.expired += 1;
      else summary.other += 1;
      return summary;
    },
    { active: 0, scheduled: 0, expired: 0, other: 0 },
  );
}

export default async function AdminFeaturedListingsPage() {
  await requireUser("admin");

  const admin = getSupabaseAdmin();
  if (!admin.ok) {
    throw new Error(admin.error);
  }

  try {
    await admin.data.rpc("expire_featured_subscriptions");
  } catch {
    // Ignore expiry refresh failures and continue rendering admin data.
  }
  await expireWebinarFeaturedSubscriptionsSafe(admin.data);

  const [{ data: plans, error: plansError }, { data: orders, error: ordersError }, { data: subscriptions, error: subscriptionsError }, { data: institutes, error: institutesError }, { data: coursePlans, error: coursePlansError }, { data: courseOrders, error: courseOrdersError }, { data: courseSubscriptions, error: courseSubscriptionsError }, { data: courseRows, error: courseRowsError }, { data: webinarPlans, error: webinarPlansError }, { data: webinarOrders, error: webinarOrdersError }, { data: webinarSubscriptions, error: webinarSubscriptionsError }, { data: webinarRows, error: webinarRowsError }, { data: activeFeaturedWebinars, error: activeFeaturedWebinarsError }] = await Promise.all([
    admin.data.from("featured_listing_plans").select("*").order("sort_order", { ascending: true }),
    admin.data.from("featured_listing_orders").select("id,institute_id,plan_id,amount,currency,payment_status,order_status,paid_at,created_at").order("created_at", { ascending: false }).limit(200),
    admin.data.from("institute_featured_subscriptions").select("id,institute_id,plan_code,amount,currency,status,starts_at,ends_at,queued_from_previous,order_id,created_at").order("created_at", { ascending: false }).limit(200),
    admin.data.from("institutes").select("id,name"),
    admin.data.from("course_featured_plans").select("*").order("sort_order", { ascending: true }),
    admin.data.from("course_featured_orders").select("id,institute_id,course_id,plan_id,amount,currency,payment_status,order_status,paid_at,created_at").order("created_at", { ascending: false }).limit(200),
    admin.data.from("course_featured_subscriptions").select("id,institute_id,course_id,plan_code,amount,currency,status,starts_at,ends_at,queued_from_previous,order_id,created_at").order("created_at", { ascending: false }).limit(200),
    admin.data.from("courses").select("id,title"),
    admin.data.from("webinar_featured_plans").select("*").order("sort_order", { ascending: true }),
    admin.data.from("webinar_featured_orders").select("id,institute_id,webinar_id,plan_id,amount,currency,payment_status,order_status,paid_at,created_at").order("created_at", { ascending: false }).limit(200),
    admin.data.from("webinar_featured_subscriptions").select("id,institute_id,webinar_id,plan_code,amount,currency,status,starts_at,ends_at,queued_from_previous,order_id,created_at").order("created_at", { ascending: false }).limit(200),
    admin.data.from("webinars").select("id,title"),
    admin.data.from("active_featured_webinars").select("webinar_id"),
  ]);

  const instituteNameMap = new Map((institutes as InstituteRecord[] | null | undefined)?.map((item) => [item.id, item.name ?? "Institute"]) ?? []);

  const paidOrders = ((orders ?? []) as FeaturedOrderRecord[]).filter((order) => order.payment_status === "paid");
  const revenue = paidOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
  const paidCourseOrders = ((courseOrders ?? []) as CourseFeaturedOrderRecord[]).filter((order) => order.payment_status === "paid");
  const courseRevenue = paidCourseOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
  const paidWebinarOrders = ((webinarOrders ?? []) as WebinarFeaturedOrderRecord[]).filter((order) => order.payment_status === "paid");
  const webinarRevenue = paidWebinarOrders.reduce((sum, order) => sum + Number(order.amount ?? 0), 0);
  const courseNameMap = new Map(((courseRows ?? []) as Array<{ id: string; title: string | null }>).map((item) => [item.id, item.title ?? "Course"]));
  const webinarNameMap = new Map(((webinarRows ?? []) as Array<{ id: string; title: string | null }>).map((item) => [item.id, item.title ?? "Webinar"]));
  const instituteSubscriptionSummary = summarizeSubscriptionStates(subscriptions as FeaturedSubscriptionRecord[] | null | undefined);
  const courseSubscriptionSummary = summarizeSubscriptionStates(courseSubscriptions as CourseFeaturedSubscriptionRecord[] | null | undefined);
  const webinarSubscriptionSummary = summarizeSubscriptionStates(webinarSubscriptions as WebinarFeaturedSubscriptionRecord[] | null | undefined);
  const errors = [
    plansError,
    ordersError,
    subscriptionsError,
    institutesError,
    coursePlansError,
    courseOrdersError,
    courseSubscriptionsError,
    courseRowsError,
    webinarPlansError,
    webinarOrdersError,
    webinarSubscriptionsError,
    webinarRowsError,
    activeFeaturedWebinarsError,
  ]
    .filter(Boolean)
    .map((error) => error?.message);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Featured Listing Oversight</h1>
      <p className="mt-1 text-sm text-slate-600">Smart oversight dashboard for plans, revenue, and subscription health across institute, course, and webinar listings.</p>
      {errors.length > 0 ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Some data blocks could not be loaded fully.</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Plans</p>
          <p className="mt-1 text-2xl font-semibold">{plans?.length ?? 0}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Orders</p>
          <p className="mt-1 text-2xl font-semibold">{orders?.length ?? 0}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Subscriptions</p>
          <p className="mt-1 text-2xl font-semibold">{subscriptions?.length ?? 0}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Featured Revenue</p>
          <p className="mt-1 text-2xl font-semibold">{money(revenue)}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Course Featured Revenue</p>
          <p className="mt-1 text-2xl font-semibold">{money(courseRevenue)}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Webinar Featured Revenue</p>
          <p className="mt-1 text-2xl font-semibold">{money(webinarRevenue)}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Active Featured Webinars</p>
          <p className="mt-1 text-2xl font-semibold">{activeFeaturedWebinars?.length ?? 0}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Institute Subscriptions</p>
          <p className="mt-1 text-sm text-slate-700">Active {instituteSubscriptionSummary.active} · Scheduled {instituteSubscriptionSummary.scheduled} · Expired {instituteSubscriptionSummary.expired}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Course Subscriptions</p>
          <p className="mt-1 text-sm text-slate-700">Active {courseSubscriptionSummary.active} · Scheduled {courseSubscriptionSummary.scheduled} · Expired {courseSubscriptionSummary.expired}</p>
        </div>
        <div className="rounded border bg-white p-4 text-sm">
          <p className="text-xs uppercase text-slate-500">Webinar Subscriptions</p>
          <p className="mt-1 text-sm text-slate-700">Active {webinarSubscriptionSummary.active} · Scheduled {webinarSubscriptionSummary.scheduled} · Expired {webinarSubscriptionSummary.expired}</p>
        </div>
      </div>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Featured Plans</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2">Duration</th>
                <th className="px-2 py-2">Price</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(plans ?? []).map((plan: Record<string, unknown>) => (
                <tr key={String(plan.id)} className="border-t">
                  <td className="px-2 py-2">{String(plan.name ?? plan.plan_code ?? plan.code ?? "Plan")}</td>
                  <td className="px-2 py-2">{String(plan.duration_days ?? "-")} days</td>
                  <td className="px-2 py-2">{money(Number(plan.price ?? plan.amount ?? 0), String(plan.currency ?? "INR"))}</td>
                  <td className="px-2 py-2">{plan.is_active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Course Featured Plans</h2>
        <div className="mt-3 space-y-2">
          {(coursePlans ?? []).map((plan: Record<string, unknown>) => (
            <div key={String(plan.id)} className="rounded border p-3 text-sm">
              <p className="font-medium">{String(plan.name ?? plan.plan_code ?? plan.code ?? "Course Plan")}</p>
              <p className="text-slate-600">
                {String(plan.duration_days ?? "-")} days · {money(Number(plan.price ?? plan.amount ?? 0), String(plan.currency ?? "INR"))}
              </p>
              <p className="text-xs text-slate-500">Status: {plan.is_active ? "Active" : "Inactive"}</p>
            </div>
          ))}
          {(coursePlans?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No course featured plans found.</p> : null}
        </div>
      </section>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Course Featured Orders</h2>
        <div className="mt-3 space-y-2">
          {((courseOrders ?? []) as CourseFeaturedOrderRecord[]).map((order) => (
            <div key={order.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {courseNameMap.get(order.course_id) ?? "Course"} · {instituteNameMap.get(order.institute_id) ?? "Institute"} · {money(Number(order.amount ?? 0), order.currency ?? "INR")}
              </p>
              <p className="text-slate-600">Payment: {order.payment_status} · Order: {order.order_status}</p>
              <p className="text-xs text-slate-500">Paid at: {formatDate(order.paid_at)} · Created: {formatDate(order.created_at)}</p>
            </div>
          ))}
          {(courseOrders?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No course featured orders found.</p> : null}
        </div>
      </section>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Course Featured Subscription Ledger</h2>
        <div className="mt-3 space-y-2">
          {((courseSubscriptions ?? []) as CourseFeaturedSubscriptionRecord[]).map((subscription) => (
            <div key={subscription.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {courseNameMap.get(subscription.course_id) ?? "Course"} · {instituteNameMap.get(subscription.institute_id) ?? "Institute"} · {subscription.plan_code ?? "Plan"} · {money(Number(subscription.amount ?? 0), subscription.currency ?? "INR")}
              </p>
              <p className="text-slate-600">
                Status: {subscription.status} · Starts: {formatDate(subscription.starts_at)} · Ends: {formatDate(subscription.ends_at)}
              </p>
              <p className="text-xs text-slate-500">
                Queued from previous: {subscription.queued_from_previous ? "Yes" : "No"} · Linked order: {subscription.order_id ?? "-"}
              </p>
            </div>
          ))}
          {(courseSubscriptions?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No course featured subscriptions found.</p> : null}
        </div>
      </section>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Webinar Featured Plans</h2>
        <div className="mt-3 space-y-2">
          {(webinarPlans ?? []).map((plan: Record<string, unknown>) => (
            <div key={String(plan.id)} className="rounded border p-3 text-sm">
              <p className="font-medium">{String(plan.name ?? plan.plan_code ?? plan.code ?? "Webinar Plan")}</p>
              <p className="text-slate-600">
                {String(plan.duration_days ?? "-")} days · {money(Number(plan.price ?? plan.amount ?? 0), String(plan.currency ?? "INR"))}
              </p>
              <p className="text-xs text-slate-500">Status: {plan.is_active ? "Active" : "Inactive"}</p>
            </div>
          ))}
          {(webinarPlans?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No webinar featured plans found.</p> : null}
        </div>
      </section>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Webinar Featured Orders</h2>
        <div className="mt-3 space-y-2">
          {((webinarOrders ?? []) as WebinarFeaturedOrderRecord[]).map((order) => (
            <div key={order.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {webinarNameMap.get(order.webinar_id) ?? "Webinar"} · {instituteNameMap.get(order.institute_id) ?? "Institute"} · {money(Number(order.amount ?? 0), order.currency ?? "INR")}
              </p>
              <p className="text-slate-600">Payment: {order.payment_status} · Order: {order.order_status}</p>
              <p className="text-xs text-slate-500">Paid at: {formatDate(order.paid_at)} · Created: {formatDate(order.created_at)}</p>
            </div>
          ))}
          {(webinarOrders?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No webinar featured orders found.</p> : null}
        </div>
      </section>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Webinar Featured Subscription Ledger</h2>
        <div className="mt-3 space-y-2">
          {((webinarSubscriptions ?? []) as WebinarFeaturedSubscriptionRecord[]).map((subscription) => (
            <div key={subscription.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {webinarNameMap.get(subscription.webinar_id) ?? "Webinar"} · {instituteNameMap.get(subscription.institute_id) ?? "Institute"} · {subscription.plan_code ?? "Plan"} · {money(Number(subscription.amount ?? 0), subscription.currency ?? "INR")}
              </p>
              <p className="text-slate-600">
                Status: {subscription.status} · Starts: {formatDate(subscription.starts_at)} · Ends: {formatDate(subscription.ends_at)}
              </p>
              <p className="text-xs text-slate-500">
                Queued from previous: {subscription.queued_from_previous ? "Yes" : "No"} · Linked order: {subscription.order_id ?? "-"}
              </p>
            </div>
          ))}
          {(webinarSubscriptions?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No webinar featured subscriptions found.</p> : null}
        </div>
      </section>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Featured Orders</h2>
        <div className="mt-3 space-y-2">
          {((orders ?? []) as FeaturedOrderRecord[]).map((order) => (
            <div key={order.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {instituteNameMap.get(order.institute_id) ?? "Institute"} · {money(Number(order.amount ?? 0), order.currency ?? "INR")}
              </p>
              <p className="text-slate-600">Payment: {order.payment_status} · Order: {order.order_status}</p>
              <p className="text-xs text-slate-500">Paid at: {formatDate(order.paid_at)} · Created: {formatDate(order.created_at)}</p>
            </div>
          ))}
          {(orders?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No featured orders found.</p> : null}
        </div>
      </section>

      <section className="mt-8 rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">Featured Subscription Ledger</h2>
        <div className="mt-3 space-y-2">
          {((subscriptions ?? []) as FeaturedSubscriptionRecord[]).map((subscription) => (
            <div key={subscription.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {instituteNameMap.get(subscription.institute_id) ?? "Institute"} · {subscription.plan_code} · {money(Number(subscription.amount ?? 0), subscription.currency ?? "INR")}
              </p>
              <p className="text-slate-600">
                Status: {subscription.status} · Starts: {formatDate(subscription.starts_at)} · Ends: {formatDate(subscription.ends_at)}
              </p>
              <p className="text-xs text-slate-500">
                Queued from previous: {subscription.queued_from_previous ? "Yes" : "No"} · Linked order: {subscription.order_id ?? "-"}
              </p>
            </div>
          ))}
          {(subscriptions?.length ?? 0) === 0 ? <p className="text-sm text-slate-500">No featured subscriptions found.</p> : null}
        </div>
      </section>
    </div>
  );
}
