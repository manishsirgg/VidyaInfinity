"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export type ListingFilterItem = {
  id: string;
  search: string;
  price?: number | null;
  featured?: boolean;
  verified?: boolean;
  facets: Record<string, string | null | undefined>;
};

type Props = {
  items: ListingFilterItem[];
  cards: ReactNode[];
  facets: { key: string; label: string }[];
  columns?: 2 | 3;
  priceLabel?: string;
  emptyLabel?: string;
};

export function FilterableListings({ items, cards, facets, columns = 2, priceLabel = "Price (₹)", emptyLabel = "No listings match your filters." }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState("recommended");

  const facetValues = useMemo(() => facets.map((facet) => ({
    ...facet,
    values: [...new Set(items.map((item) => item.facets[facet.key]?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b)),
  })), [facets, items]);

  const results = useMemo(() => items.map((item, index) => ({ item, card: cards[index], index })).filter(({ item }) => {
    if (search && !item.search.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) return false;
    if (featuredOnly && !item.featured) return false;
    if (verifiedOnly && !item.verified) return false;
    if (minPrice.trim() && (!Number.isFinite(Number(minPrice)) || item.price == null || item.price < Number(minPrice))) return false;
    if (maxPrice.trim() && (!Number.isFinite(Number(maxPrice)) || item.price == null || item.price > Number(maxPrice))) return false;
    return facets.every(({ key }) => !selected[key]?.length || selected[key].includes(item.facets[key] ?? ""));
  }).sort((a, b) => {
    if (sort === "price-asc") return (a.item.price ?? Infinity) - (b.item.price ?? Infinity);
    if (sort === "price-desc") return (b.item.price ?? -Infinity) - (a.item.price ?? -Infinity);
    if (sort === "az") return a.item.search.localeCompare(b.item.search);
    return a.index - b.index;
  }), [items, cards, facets, search, featuredOnly, verifiedOnly, minPrice, maxPrice, selected, sort]);

  const reset = () => {
    setSearch("");
    setSelected({});
    setMinPrice("");
    setMaxPrice("");
    setFeaturedOnly(false);
    setVerifiedOnly(false);
    setSort("recommended");
  };

  function toggle(key: string, value: string) {
    setSelected((previous) => {
      const current = previous[key] ?? [];
      return { ...previous, [key]: current.includes(value) ? current.filter((x) => x !== value) : [...current, value] };
    });
  }

  const hasPrices = items.some((item) => item.price != null);
  const hasFeatured = items.some((item) => item.featured);
  const hasVerified = items.some((item) => item.verified);
  const filters = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Filters</h2>
        <button type="button" onClick={reset} className="text-sm font-medium text-brand-700 hover:underline">Clear all</button>
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-800">Search</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search listings" aria-label="Search listings" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none" />
      </label>
      {facetValues.map(({ key, label, values }) => values.length > 1 ? (
        <fieldset key={key} className="border-t border-slate-200 pt-4">
          <legend className="mb-2 text-sm font-semibold text-slate-900">{label}</legend>
          <div className="max-h-44 space-y-2 overflow-y-auto">
            {values.map((value) => (
              <label key={value} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={(selected[key] ?? []).includes(value)} onChange={() => toggle(key, value)} className="mt-0.5 accent-blue-700" />
                <span className="break-words">{value.replaceAll("_", " ")}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null)}
      {hasPrices ? (
        <fieldset className="border-t border-slate-200 pt-4">
          <legend className="mb-2 text-sm font-semibold text-slate-900">{priceLabel}</legend>
          <div className="grid grid-cols-2 gap-2">
            <input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} type="number" min="0" aria-label="Minimum price" placeholder="Min" className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm" />
            <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} type="number" min="0" aria-label="Maximum price" placeholder="Max" className="w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm" />
          </div>
        </fieldset>
      ) : null}
      {hasFeatured ? <label className="flex items-center gap-2 border-t border-slate-200 pt-4 text-sm text-slate-700"><input type="checkbox" checked={featuredOnly} onChange={(e) => setFeaturedOnly(e.target.checked)} className="accent-blue-700" />Featured only</label> : null}
      {hasVerified ? <label className="flex items-center gap-2 border-t border-slate-200 pt-4 text-sm text-slate-700"><input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="accent-blue-700" />Verified only</label> : null}
    </div>
  );

  return (
    <div className="mt-7 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <button type="button" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-controls="marketplace-filters" className="mb-4 inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-4 py-2 text-sm font-semibold text-brand-700 lg:hidden">
        <SlidersHorizontal size={17} aria-hidden="true" /> Filters {mobileOpen ? <X size={16} aria-hidden="true" /> : null}
      </button>
      <aside id="marketplace-filters" aria-label="Filter listings" className={`${mobileOpen ? "block" : "hidden"} mb-5 rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24 lg:mb-0 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto`}>
        {filters}
      </aside>
      <section aria-label="Filtered listings" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-slate-600">{results.length} of {items.length} results</p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm">
              <option value="recommended">Recommended</option>
              <option value="az">Name A–Z</option>
              {hasPrices ? <option value="price-asc">Price: Low to high</option> : null}
              {hasPrices ? <option value="price-desc">Price: High to low</option> : null}
            </select>
          </label>
        </div>
        {results.length ? <div className={`grid gap-4 ${columns === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>{results.map(({ item, card }) => <div className="min-w-0" key={item.id}>{card}</div>)}</div> : <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">{emptyLabel} <button className="ml-2 font-medium text-brand-700 underline" type="button" onClick={reset}>Clear filters</button></div>}
      </section>
    </div>
  );
}
