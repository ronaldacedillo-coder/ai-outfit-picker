"use client";

import { useState } from "react";
import { deleteClothingItem } from "@/app/dashboard/actions";
import type { ClothingItemRow } from "@/lib/wardrobe/types";

export function ClothingCard({ item, onEdit }: { item: ClothingItemRow; onEdit: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteClothingItem(item.id);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageSignedUrl}
        alt={item.description}
        className="aspect-square w-full rounded object-cover"
      />
      <div className="text-sm font-medium">{item.subcategoryName.replace(/_/g, " ")}</div>
      <div className="text-xs text-neutral-500">{item.primaryColor}</div>
      <p className="line-clamp-2 text-xs text-neutral-600">{item.description}</p>
      <div className="flex gap-2 text-xs">
        <button className="underline" onClick={onEdit}>Edit</button>
        {confirming ? (
          <button className="text-red-600 underline" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Confirm delete"}
          </button>
        ) : (
          <button className="text-red-600 underline" onClick={() => setConfirming(true)}>Delete</button>
        )}
      </div>
    </div>
  );
}
