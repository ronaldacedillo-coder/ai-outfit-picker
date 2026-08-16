"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { deleteClothingItem } from "@/app/dashboard/actions";
import type { ClothingItemRow } from "@/lib/wardrobe/types";

export function ClothingCard({
  item,
  onEdit,
  readOnly = false,
  index = 0,
}: {
  item: ClothingItemRow;
  onEdit?: () => void;
  readOnly?: boolean;
  index?: number;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteClothingItem(item.id);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", bounce: 0, duration: 0.35, delay: Math.min(index, 8) * 0.03 }}
      whileHover={{ y: -2 }}
      className="flex flex-col gap-2 rounded-xl bg-surface p-3 shadow-sm transition-shadow duration-200 ease-out hover:shadow-md"
    >
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
          <button
            className="text-ink-secondary underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
            onClick={onEdit}
          >
            Edit
          </button>
          {confirming ? (
            <motion.button
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.25 }}
              className="text-danger underline underline-offset-2 disabled:opacity-60"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Confirm delete"}
            </motion.button>
          ) : (
            <button
              className="text-danger underline underline-offset-2 transition-colors duration-150 ease-out"
              onClick={() => setConfirming(true)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
