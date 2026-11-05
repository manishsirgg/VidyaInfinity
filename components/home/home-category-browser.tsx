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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={`home-category-${label}`} className="text-sm font-semibold text-slate-700">
          Select category
        </label>
        <select
          id={`home-category-${label}`}
          aria-label={`Filter ${label} by category`}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-800 shadow-sm transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200 sm:max-w-md"
        >
          <option value="all">All {label}</option>
          {groups.map((group) => (
            <option key={group.name} value={group.name}>
              {group.name} ({group.cards.length})
            </option>
          ))}
        </select>
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
