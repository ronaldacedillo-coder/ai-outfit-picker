"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteClothingItem } from "@/app/dashboard/actions";
import type { ClothingItemRow } from "@/lib/wardrobe/types";

export function ClothingCard({
  item,
  onEdit,
  readOnly = false,
}: {
  item: ClothingItemRow;
  onEdit?: () => void;
  readOnly?: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteClothingItem(item.id);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageSignedUrl}
        alt={item.description}
        className="aspect-square w-full rounded-lg object-cover"
      />
      <div className="font-display text-sm font-medium text-ink">{item.subcategoryName.replace(/_/g, " ")}</div>
      <div className="text-xs uppercase tracking-wide text-ink-secondary">{item.primaryColor}</div>
      <p className="line-clamp-2 text-xs text-ink-secondary">{item.description}</p>
      <Link
        href={`/dashboard/outfit-picker/${item.id}`}
        className="rounded-md bg-accent px-3 py-1.5 text-center text-xs font-medium text-accent-foreground transition-transform duration-150 ease-out hover:bg-accent-hover active:scale-[0.97]"
      >
        Find outfits
      </Link>
      {!readOnly && onEdit && (
        <div className="flex gap-3 text-xs">
          <button className="text-ink-secondary underline underline-offset-2 hover:text-ink" onClick={onEdit}>
            Edit
          </button>
          {confirming ? (
            <button className="text-danger underline underline-offset-2" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Confirm delete"}
            </button>
          ) : (
            <button className="text-danger underline underline-offset-2" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
