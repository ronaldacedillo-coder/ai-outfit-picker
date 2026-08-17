"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { LogoFull } from "@/components/brand/Logo";

// Signature visual: an abstract fabric swatch built from a herringbone weave
// pattern (menswear's own material vernacular -- thread, weave, tailoring
// lines) rather than stock photography or a generic gradient blob.
function WeaveSwatch() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.svg
      viewBox="0 0 360 460"
      className="h-[280px] w-[220px] shrink-0 sm:h-[380px] sm:w-[300px] lg:h-[460px] lg:w-[360px]"
      initial={{ opacity: 0, scale: 0.94, rotate: -2 }}
      animate={
        reduceMotion
          ? { opacity: 1, scale: 1, rotate: -6 }
          : { opacity: 1, scale: 1, rotate: -6, y: [0, -10, 0] }
      }
      transition={
        reduceMotion
          ? { type: "spring", bounce: 0, duration: 0.6 }
          : {
              opacity: { type: "spring", bounce: 0, duration: 0.6 },
              scale: { type: "spring", bounce: 0, duration: 0.6 },
              rotate: { type: "spring", bounce: 0, duration: 0.6 },
              y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
            }
      }
    >
      <defs>
        <pattern id="weave-a" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="18" stroke="#211d18" strokeOpacity="0.14" strokeWidth="6" />
        </pattern>
        <pattern id="weave-b" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="18" stroke="#211d18" strokeOpacity="0.08" strokeWidth="6" />
        </pattern>
      </defs>
      <rect x="4" y="4" width="352" height="452" rx="10" fill="#fcfbfa" stroke="#e7e5e1" strokeWidth="2" />
      <rect x="4" y="4" width="352" height="452" rx="10" fill="url(#weave-a)" />
      <rect x="4" y="4" width="352" height="452" rx="10" fill="url(#weave-b)" />
      <line
        x1="34"
        y1="26"
        x2="34"
        y2="434"
        stroke="#9a4130"
        strokeWidth="1.5"
        strokeDasharray="3 5"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

export function LandingHero() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-1 flex-col justify-center gap-16 px-6 py-24 lg:flex-row lg:items-center lg:gap-12 lg:px-10">
      <motion.div
        className="flex max-w-xl flex-col items-start gap-7"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
      >
        <LogoFull className="h-10 w-auto sm:h-12" />
        <h1 className="font-display text-[2.75rem] font-medium leading-[1.02] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[5rem]">
          Try the outfit
          <br />
          before you buy
          <br />
          the pieces.
        </h1>
        <p className="max-w-md text-lg leading-relaxed text-ink-secondary">
          Browse the ARROW catalog, pick what catches your eye, and see it combined —
          ARROW-curated pairings, AI-matched suggestions, and a generated photo of the
          exact look before you commit.
        </p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/signup"
            className="press-feedback rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors duration-150 hover:bg-accent-hover"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="press-feedback rounded-md border border-border px-5 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-muted"
          >
            Log in
          </Link>
        </div>
      </motion.div>

      <div className="flex justify-center lg:flex-1 lg:justify-end">
        <WeaveSwatch />
      </div>
    </main>
  );
}
