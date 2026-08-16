import { motion } from "motion/react";
import type { DisplayGarment } from "./types";

export function GeneratedOutfitView({
  imageUrl,
  garments,
  onBack,
  onTryAnother,
}: {
  imageUrl: string;
  garments: DisplayGarment[];
  onBack: () => void;
  onTryAnother: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
        className="overflow-hidden rounded-xl border border-border-subtle bg-surface-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Your generated outfit" className="w-full object-contain" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.35, delay: 0.15 }}
        className="flex flex-wrap gap-2"
      >
        {garments.map((g) => (
          <span
            key={g.id}
            className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-secondary"
          >
            {g.primaryColor} {g.subcategory.replace(/_/g, " ")}
          </span>
        ))}
      </motion.div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition-transform duration-150 ease-out hover:bg-surface-muted active:scale-[0.97]"
        >
          Back to recommendations
        </button>
        <button
          onClick={onTryAnother}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-transform duration-150 ease-out hover:bg-accent-hover active:scale-[0.97]"
        >
          Try another outfit
        </button>
      </div>
    </div>
  );
}
