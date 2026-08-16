"use client";

import { motion, AnimatePresence } from "motion/react";
import { useEffect, type ReactNode } from "react";

// Spring-based sheet/dialog, not a CSS transition -- interruptible and
// velocity-aware by construction (motion's spring animates from whatever
// the current presentation value is, never jumps to a keyframe). Backdrop
// and content animate blur+scale+opacity together on enter/exit
// ("materialize, don't just fade" -- see apple-design skill's materials
// section) rather than a flat cross-fade.
export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-10 flex items-center justify-center p-4"
        style={{ background: "color-mix(in srgb, var(--foreground) 40%, transparent)" }}
        initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
        animate={{ opacity: 1, backdropFilter: "blur(4px)" }}
        exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-lg rounded-xl border border-border-subtle bg-surface p-5 shadow-lg"
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ type: "spring", bounce: 0, duration: 0.35 }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
