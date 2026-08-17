"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { processImageFile } from "@/lib/image/process";
import { validateImageFile } from "@/lib/image/validate";
import {
  analyzeClothingPhoto,
  cancelClothingUpload,
  saveClothingItem,
  uploadClothingPhoto,
} from "@/app/dashboard/actions";
import type { ClothingAnalysisInput } from "@/lib/validation/clothing";
import { ReviewForm, type ReviewFormSaveInput } from "./ReviewForm";
import type { CategoryOption, SubcategoryOption } from "@/lib/wardrobe/matchCategory";

type Status = "uploading" | "analyzing" | "review" | "saving" | "saved" | "error";

// Provider-level timeouts (see GEMINI_HTTP_TIMEOUT_MS in gemini.ts) bound
// each individual Gemini call, but a chain of up to 6 fallback keys x up to
// 3 attempts each can still legitimately take a while. This is a last-resort
// safety net, not the primary fix -- it exists so that any failure mode the
// server-side timeouts don't cover (a genuine platform-level hang, a dropped
// connection with no error event) still can't leave this card stuck on
// "Analyzing with AI..." forever. See runAnalysis's catch block below, and
// the more immediate handleSkipAnalysis escape hatch for the (confirmed
// live) case where the request is simply slow, not actually hung.
const ANALYSIS_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Analysis timed out.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export function UploadItemCard({
  file,
  categories,
  subcategories,
  onSaved,
  onRemove,
}: {
  file: File;
  categories: CategoryOption[];
  subcategories: SubcategoryOption[];
  onSaved: () => void;
  onRemove: () => void;
}) {
  const [status, setStatus] = useState<Status>("uploading");
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ClothingAnalysisInput | null>(null);
  // Guards against React's dev-mode StrictMode double-invoking this effect,
  // which would otherwise upload the same file twice.
  const startedRef = useRef(false);
  // Bumped on every new analysis attempt and by handleSkipAnalysis. A
  // request only applies its result if this hasn't moved on since it
  // started -- covers both "user skipped while this was in flight" and
  // "user hit re-analyze again before the previous attempt returned", so
  // a slow, superseded response can never clobber the review form (or,
  // worse, silently revert an already-saved card back to "review") once
  // the user has moved past it.
  const analysisAttemptRef = useRef(0);
  // Lazy useState initializer (not a ref read) so the object URL is created
  // exactly once and stays stable across re-renders.
  const [previewUrl] = useState(() => URL.createObjectURL(file));

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function runAnalysis(pathToAnalyze: string) {
    const attemptId = ++analysisAttemptRef.current;
    setStatus("analyzing");
    let result: ClothingAnalysisInput | null = null;
    try {
      const analysisResult = await withTimeout(analyzeClothingPhoto(pathToAnalyze), ANALYSIS_TIMEOUT_MS);
      result = "error" in analysisResult ? null : analysisResult.data.analysis;
    } catch {
      // A network failure, a Server Action invocation error, or the
      // withTimeout guard above all throw instead of returning {error} --
      // without this catch, the component would stay on "Analyzing with
      // AI..." forever with no way for the user to escape it. Degrade the
      // same way a clean analysis {error} does: straight to manual
      // review, never a dead end.
      result = null;
    }
    if (analysisAttemptRef.current !== attemptId) return; // superseded by a skip or a newer attempt
    setAnalysis(result);
    setStatus("review");
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      let uploadedPath: string;
      try {
        const validation = validateImageFile(file);
        if (!validation.valid) {
          setError(validation.error);
          setStatus("error");
          return;
        }

        const processed = await processImageFile(file);
        const uploadResult = await uploadClothingPhoto(processed, "jpg");
        if ("error" in uploadResult) {
          setError(uploadResult.error);
          setStatus("error");
          return;
        }
        uploadedPath = uploadResult.data.path;
        setPath(uploadedPath);
      } catch {
        setError("Couldn't upload this photo — please try again.");
        setStatus("error");
        return;
      }

      await runAnalysis(uploadedPath);
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReanalyze() {
    if (!path) return;
    await runAnalysis(path);
  }

  // Lets the user bail out of a slow (or genuinely stuck) analysis
  // immediately instead of waiting up to ANALYSIS_TIMEOUT_MS -- real-world
  // analysis latency can legitimately run into the tens of seconds under
  // heavy AI-provider rate-limit pressure (confirmed live: fallback keys
  // exhausting their quota and retrying in sequence), which reads as
  // "stuck" to someone watching a static pulsing label with no progress
  // indicator and no way to act. Bumping analysisAttemptRef means the
  // in-flight request's result, whenever it eventually arrives, is
  // discarded rather than silently overwriting whatever the user has
  // already typed into the review form by then.
  function handleSkipAnalysis() {
    analysisAttemptRef.current++;
    setAnalysis(null);
    setStatus("review");
  }

  async function handleSave(input: ReviewFormSaveInput) {
    if (!path) return;
    setStatus("saving");
    const result = await saveClothingItem({ ...input, imagePath: path, aiAnalysis: analysis ?? undefined });
    if ("error" in result) {
      setError(result.error);
      setStatus("review");
      return;
    }
    setStatus("saved");
    onSaved();
  }

  async function handleCancel() {
    if (path) await cancelClothingUpload(path);
    onRemove();
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
      className="flex gap-4 rounded-xl border border-border bg-surface p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt={`Preview of ${file.name}`}
        className="h-32 w-32 shrink-0 rounded-lg object-cover"
      />
      <div className="min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {status === "uploading" && (
            <motion.p
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-sm text-ink-secondary"
            >
              Uploading…
            </motion.p>
          )}
          {status === "analyzing" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col gap-1.5"
            >
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                className="text-sm text-ink-secondary"
              >
                Analyzing with AI…
              </motion.p>
              <p className="text-xs text-ink-muted">
                This can take up to a minute.{" "}
                <button
                  className="underline underline-offset-2 transition-colors duration-150 ease-out hover:text-ink"
                  onClick={handleSkipAnalysis}
                >
                  Skip and fill in manually
                </button>
              </p>
            </motion.div>
          )}
          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.25 }}
              className="text-sm text-danger"
            >
              {error}
              <button
                className="ml-2 underline underline-offset-2 transition-colors duration-150 ease-out hover:text-danger-hover"
                onClick={handleCancel}
              >
                Remove
              </button>
            </motion.div>
          )}
          {(status === "review" || status === "saving") && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            >
              <ReviewForm
                analysis={analysis}
                categories={categories}
                subcategories={subcategories}
                onSave={handleSave}
                onReanalyze={handleReanalyze}
                onCancel={handleCancel}
                saving={status === "saving"}
              />
            </motion.div>
          )}
          {status === "saved" && (
            <motion.p
              key="saved"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="text-sm text-ink-secondary"
            >
              Saved to your wardrobe.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
