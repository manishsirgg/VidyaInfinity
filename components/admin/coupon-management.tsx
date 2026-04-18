"use client";

import { FormEvent, useState } from "react";

type CouponItem = {
  id: string;
  code: string;
  discount_percentage: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export function CouponManagement({ initialCoupons }: { initialCoupons: CouponItem[] }) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [message, setMessage] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function createCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: formData.get("code"),
        discountPercentage: Number(formData.get("discountPercentage")),
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
      body: JSON.stringify({ isActive: !coupon.is_active }),
    });
    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setMessage(body.error ?? "Unable to update coupon");
      return;
    }

    setCoupons((prev) => prev.map((item) => (item.id === coupon.id ? { ...item, ...body.coupon } : item)));
    setMessage(`Coupon ${coupon.code} ${coupon.is_active ? "disabled" : "enabled"}`);
  }

  async function deleteCoupon(id: string, code: string) {
    if (!window.confirm(`Delete coupon ${code}?`)) return;

    setLoadingId(id);
    const response = await fetch(`/api/admin/coupons/${id}`, { method: "DELETE" });
    const body = await response.json();
    setLoadingId(null);

    if (!response.ok) {
      setMessage(body.error ?? "Unable to delete coupon");
      return;
    }

    setCoupons((prev) => prev.filter((coupon) => coupon.id !== id));
    setMessage("Coupon deleted");
  }

  return (
    <div className="mt-4 space-y-6">
      <form onSubmit={createCoupon} className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-3 sm:items-end">
        <div>
          <label className="text-sm">Coupon code</label>
          <input required name="code" placeholder="NEWUSER20" className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="text-sm">Discount (%)</label>
          <input required name="discountPercentage" type="number" min={1} max={100} className="mt-1 w-full rounded border px-3 py-2" />
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

      <div className="space-y-2">
        {coupons.map((coupon) => (
          <div key={coupon.id} className="rounded border bg-white p-3 text-sm">
            <p className="font-medium">
              {coupon.code} · {coupon.discount_percentage}% · {coupon.is_active ? "Active" : "Inactive"}
            </p>
            <p className="text-xs text-slate-500">
              Created: {coupon.created_at ? new Date(coupon.created_at).toLocaleString() : "-"} · Updated: {coupon.updated_at ? new Date(coupon.updated_at).toLocaleString() : "-"}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                disabled={loadingId === coupon.id}
                onClick={() => toggleCoupon(coupon)}
                className="rounded bg-slate-700 px-2 py-1 text-xs text-white"
              >
                {coupon.is_active ? "Disable" : "Enable"}
              </button>
              <button
                disabled={loadingId === coupon.id}
                onClick={() => deleteCoupon(coupon.id, coupon.code)}
                className="rounded bg-rose-700 px-2 py-1 text-xs text-white"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
