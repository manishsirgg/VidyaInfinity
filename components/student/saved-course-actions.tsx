"use client";

import { useState } from "react";

export function SavedCourseActions({ courseId }: { courseId: string }) {
  const [busy, setBusy] = useState<"none" | "save" | "cart">("none");
  const [message, setMessage] = useState("");

  async function removeSaved() {
    setBusy("save");
    setMessage("");

    const response = await fetch("/api/student/saved-courses", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });

    const body = await response.json().catch(() => null);
    setBusy("none");

    if (!response.ok) {
      setMessage(body?.error ?? "Unable to remove saved course.");
      return;
    }

    setMessage("Removed from saved courses. Refresh to update the list.");
  }

  async function addToCart() {
    setBusy("cart");
    setMessage("");

    const response = await fetch("/api/student/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId }),
    });

    const body = await response.json().catch(() => null);
    setBusy("none");

    if (!response.ok) {
      setMessage(body?.error ?? "Unable to add course to cart.");
      return;
    }

    setMessage("Added to checkout cart.");
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={addToCart}
        disabled={busy !== "none"}
        className="rounded bg-brand-600 px-3 py-2 text-xs text-white disabled:opacity-60"
      >
        {busy === "cart" ? "Adding..." : "Add to Cart"}
      </button>
      <button
        type="button"
        onClick={removeSaved}
        disabled={busy !== "none"}
        className="rounded border border-slate-300 px-3 py-2 text-xs text-slate-700 disabled:opacity-60"
      >
        {busy === "save" ? "Removing..." : "Remove"}
      </button>
      {message ? <p className="w-full text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
