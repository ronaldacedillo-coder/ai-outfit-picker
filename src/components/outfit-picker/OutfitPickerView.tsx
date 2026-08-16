"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { generateOutfitVisualization } from "@/app/dashboard/outfit-actions";
import { getOutfitImageUrl } from "@/app/dashboard/outfit-picker-actions";
import { RecommendationCard } from "./RecommendationCard";
import { GeneratedOutfitView } from "./GeneratedOutfitView";
import type { DisplayCandidate, DisplayGarment } from "./types";

const STATUS_MESSAGES = [
  "Creating your outfit…",
  "Generating your AI model…",
  "Almost ready…",
];

interface SelectedItem {
  id: string;
  imageSignedUrl: string;
  subcategoryName: string;
  primaryColor: string;
}

type ViewState =
  | { mode: "browsing" }
  | { mode: "generating"; candidateIndex: number }
  | { mode: "generated"; imageUrl: string; garments: DisplayGarment[] }
  | { mode: "error"; message: string };

export function OutfitPickerView({
  selectedItem,
  candidates,
}: {
  selectedItem: SelectedItem;
  candidates: DisplayCandidate[];
}) {
  const [view, setView] = useState<ViewState>({ mode: "browsing" });
  const [statusIndex, setStatusIndex] = useState(0);
  const generatingRef = useRef(false);

  useEffect(() => {
    if (view.mode !== "generating") return;
    const timer = setInterval(() => {
      setStatusIndex((i) => Math.min(i + 1, STATUS_MESSAGES.length - 1));
    }, 2500);
    return () => clearInterval(timer);
  }, [view.mode]);

  async function handleVisualize(index: number, candidate: DisplayCandidate) {
    if (generatingRef.current) return; // one click, one generation -- never per-recommendation
    generatingRef.current = true;
    setStatusIndex(0);
    setView({ mode: "generating", candidateIndex: index });

    const result = await generateOutfitVisualization(
      candidate.garments.map((g) => g.id),
      undefined,
      undefined,
      {
        compatibilityScore: candidate.score,
        scoreBreakdown: candidate.scoreBreakdown,
        aiExplanation: candidate.explanation,
      }
    );

    if ("error" in result) {
      generatingRef.current = false;
      setView({ mode: "error", message: result.error });
      return;
    }

    const signed = await getOutfitImageUrl(result.data.outfitId);
    generatingRef.current = false;
    if ("error" in signed) {
      setView({ mode: "error", message: signed.error });
      return;
    }

    setView({ mode: "generated", imageUrl: signed.data.imageUrl, garments: candidate.garments });
  }

  if (view.mode === "generated") {
    return (
      <GeneratedOutfitView
        imageUrl={view.imageUrl}
        garments={view.garments}
        onBack={() => setView({ mode: "browsing" })}
        onTryAnother={() => setView({ mode: "browsing" })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-muted p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selectedItem.imageSignedUrl}
          alt={`${selectedItem.primaryColor} ${selectedItem.subcategoryName}`}
          className="h-16 w-16 rounded-lg object-cover ring-1 ring-border"
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">Styling from</p>
          <p className="font-display text-sm font-medium text-ink">
            {selectedItem.primaryColor} {selectedItem.subcategoryName.replace(/_/g, " ")}
          </p>
        </div>
      </div>

      {view.mode === "error" && (
        <p className="rounded-md bg-danger-surface px-4 py-3 text-sm text-danger">{view.message}</p>
      )}

      {view.mode === "generating" && (
        <div className="relative h-5 overflow-hidden text-sm font-medium text-ink-secondary">
          <AnimatePresence mode="wait">
            <motion.p
              key={statusIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="absolute inset-0"
            >
              {STATUS_MESSAGES[statusIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      )}

      {candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-muted px-6 py-10 text-center text-sm text-ink-secondary">
          We couldn&apos;t find a strong match in your wardrobe yet. Try adding more shirts or pants.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {candidates.map((candidate, index) => (
            <RecommendationCard
              key={index}
              candidate={candidate}
              index={index}
              onVisualize={() => handleVisualize(index, candidate)}
              visualizing={view.mode === "generating" && view.candidateIndex === index}
              disabled={view.mode === "generating"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
