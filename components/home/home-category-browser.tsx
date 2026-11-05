"use client";

import { useState, type ReactNode } from "react";

export type HomeCategoryGroup = {
  name: string;
  cards: ReactNode[];
};

type Props = {
  groups: HomeCategoryGroup[];
  emptyMessage: string;
  label: string;
};

export function HomeCategoryBrowser({ groups, emptyMessage, label }: Props) {
  const [selected, setSelected] = useState("all");
  const active = selected === "all" ? null : groups.find((group) => group.name === selected);
  const displayedCards = active
    ? active.cards
    : groups.flatMap((group) => group.cards).slice(0, 6);

  if (groups.length === 0) {
    return <p className="mt-5 text-sm text-slate-600">{emptyMessage}</p>;
  }

  return (
    <div className="mt-5">
      <div aria-label={`Browse ${label} categories`} className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={selected === "all"}
          onClick={() => setSelected("all")}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${selected === "all" ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50"}`}
        >
          All {label}
        </button>
        {groups.map((group) => (
          <button
            key={group.name}
            type="button"
            aria-pressed={selected === group.name}
            onClick={() => setSelected(group.name)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${selected === group.name ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50"}`}
          >
            {group.name} <span className="ml-1 opacity-75">({group.cards.length})</span>
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mt-3 text-xs text-slate-500">
        {selected === "all" ? `Showing ${displayedCards.length} ${label.toLowerCase()} across categories` : `Showing ${displayedCards.length} in ${selected}`}
      </div>
      <div className="mt-4 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {displayedCards.map((card, index) => <div className="min-w-0" key={index}>{card}</div>)}
      </div>
    </div>
  );
}
