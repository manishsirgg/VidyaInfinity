"use client";

import { FormEvent, useState } from "react";

import { couponScopes, type CouponScope } from "@/lib/coupons";

type CouponItem = {
  id: string;
  code: string;
  applies_to: CouponScope | null;
  discount_percent: number;
  expiry_date: string | null;
  active: boolean;
  created_at: string | null;
};

export function CouponManagement({ initialCoupons }: { initialCoupons: CouponItem[] }) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<CouponScope | "all">("all");

  async function createCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: formData.get("code"),
        appliesTo: formData.get("appliesTo"),
        discountPercentage: Number(formData.get("discountPercentage")),
        expiryDate: formData.get("expiryDate") || null,
        isActive: formData.get("isActive") === "on",
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Unable to create coupon");
      return;
    }

    setCoupons((prev) => [body.coupon as CouponItem, ...prev]);
    setMessage("Coupon created successfully");
    event.currentTarget.reset();
  }

  async function toggleCoupon(coupon: CouponItem) {
    setLoadingId(coupon.id);
    const response = await fetch(`/api/admin/coupons/${coupon.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !coupon.active }),
    });
    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setMessage(body.error ?? "Unable to update coupon");
      return;
    }

    setCoupons((prev) => prev.map((item) => (item.id === coupon.id ? { ...item, ...body.coupon } : item)));
    setMessage(`Coupon ${coupon.code} ${coupon.active ? "disabled" : "enabled"}`);
  }

  async function deactivateCoupon(id: string, code: string) {
    if (!window.confirm(`Deactivate coupon ${code}?`)) return;

    setLoadingId(id);
    const response = await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setMessage(body.error ?? "Unable to deactivate coupon");
      return;
    }

    setCoupons((prev) => prev.map((coupon) => (coupon.id === id ? { ...coupon, ...body.coupon } : coupon)));
    setMessage("Coupon deactivated");
  }

  return (
    <div className="mt-4 space-y-6">
      <form onSubmit={createCoupon} className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-6 sm:items-end">
        <div>
          <label className="text-sm">Coupon code</label>
          <input required name="code" placeholder="NEWUSER20" className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="text-sm">Applies to</label>
          <select required name="appliesTo" defaultValue="psychometric" className="mt-1 w-full rounded border px-3 py-2">
            {couponScopes.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm">Discount (%)</label>
          <input required name="discountPercentage" type="number" min={1} max={100} className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="text-sm">Expiry date</label>
          <input name="expiryDate" type="date" className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked /> Active
          </label>
          <button className="rounded bg-brand-600 px-3 py-2 text-white" type="submit">
            Add Coupon
          </button>
        </div>
      </form>

      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="scopeFilter">Filter:</label>
        <select
          id="scopeFilter"
          value={scopeFilter}
          onChange={(event) => setScopeFilter(event.target.value as CouponScope | "all")}
          className="rounded border px-3 py-2"
        >
          <option value="all">All scopes</option>
          {couponScopes.map((scope) => (
            <option key={scope} value={scope}>
              {scope}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {coupons
          .filter((coupon) => (scopeFilter === "all" ? true : coupon.applies_to === scopeFilter))
          .map((coupon) => (
          <div key={coupon.id} className="rounded border bg-white p-3 text-sm">
            <p className="font-medium">
              {coupon.code} · {coupon.applies_to ?? "unscoped"} · {coupon.discount_percent}% · {coupon.active ? "Active" : "Inactive"}
            </p>
            <p className="text-xs text-slate-500">
              Created: {coupon.created_at ? new Date(coupon.created_at).toLocaleString() : "-"} · Expires: {coupon.expiry_date ? new Date(coupon.expiry_date).toLocaleDateString() : "Never"}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                disabled={loadingId === coupon.id}
                onClick={() => toggleCoupon(coupon)}
                className="rounded bg-slate-700 px-2 py-1 text-xs text-white"
              >
                {coupon.active ? "Disable" : "Enable"}
              </button>
              <button
                disabled={loadingId === coupon.id}
                onClick={() => deactivateCoupon(coupon.id, coupon.code)}
                className="rounded bg-rose-700 px-2 py-1 text-xs text-white"
              >
                Deactivate
              </button>
            </div>
          </div>
        ))}
      </div>

      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
