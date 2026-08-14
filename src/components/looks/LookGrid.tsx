"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LookCard } from "./LookCard";
import type { LookSummary } from "@/app/dashboard/outfit-history-actions";

type SortOption = "newest" | "oldest" | "highest_match";
type StyleFilter = "all" | "business_formal" | "business_casual" | "smart_casual" | "casual";

const STYLE_LABEL: Record<Exclude<StyleFilter, "all">, string> = {
  business_formal: "Business Formal",
  business_casual: "Business Casual",
  smart_casual: "Smart Casual",
  casual: "Casual",
};

export function LookGrid({ looks }: { looks: LookSummary[] }) {
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("all");
  const [sort, setSort] = useState<SortOption>("newest");

  const visible = useMemo(() => {
    const filtered = looks.filter((look) => styleFilter === "all" || look.style === styleFilter);
    const sorted = [...filtered];
    if (sort === "oldest") {
      sorted.reverse();
    } else if (sort === "highest_match") {
      sorted.sort((a, b) => (b.compatibilityScore ?? -1) - (a.compatibilityScore ?? -1));
    }
    return sorted;
  }, [looks, styleFilter, sort]);

  if (looks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl bg-stone-50 px-6 py-20 text-center">
        <h2 className="text-lg font-semibold text-stone-900">Your Lookbook is empty</h2>
        <p className="text-sm text-stone-600">Create your first outfit from your wardrobe.</p>
        <Link
          href="/dashboard"
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-transform duration-150 ease-out hover:bg-stone-800 active:scale-[0.97]"
        >
          Find an Outfit
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <select
          className="rounded border border-stone-300 px-2 py-1"
          value={styleFilter}
          onChange={(e) => setStyleFilter(e.target.value as StyleFilter)}
        >
          <option value="all">All Looks</option>
          {(Object.keys(STYLE_LABEL) as Exclude<StyleFilter, "all">[]).map((s) => (
            <option key={s} value={s}>
              {STYLE_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-stone-300 px-2 py-1"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="highest_match">Highest match</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl bg-stone-50 px-6 py-10 text-center text-sm text-stone-600">
          No looks match this filter yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {visible.map((look) => (
            <LookCard key={look.id} look={look} />
          ))}
        </div>
      )}
    </div>
  );
}
