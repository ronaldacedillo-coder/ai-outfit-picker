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
  // Lazy useState initializer (not a ref read) so the object URL is created
  // exactly once and stays stable across re-renders.
  const [previewUrl] = useState(() => URL.createObjectURL(file));

  useEffect(() => {
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      // Tracked locally, not read back from the `path` state, since a
      // catch block right after setPath() can't rely on that state update
      // having flushed yet.
      let uploadedPath: string | null = null;
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

        setStatus("analyzing");
        const analysisResult = await analyzeClothingPhoto(uploadedPath);
        setAnalysis("error" in analysisResult ? null : analysisResult.data.analysis);
        setStatus("review");
      } catch {
        // A network failure or Server Action invocation error (e.g. a
        // platform-level timeout) throws instead of returning {error} --
        // without this catch, the component would stay on "Analyzing with
        // AI..." forever with no way for the user to escape it, since
        // nothing after the throw ever runs to change the status. If the
        // upload itself already succeeded, degrade the same way a clean
        // analysis {error} does -- straight to manual review, not a
        // dead-end that forces the user to remove and re-upload.
        if (uploadedPath) {
          setAnalysis(null);
          setStatus("review");
        } else {
          setError("Couldn't upload this photo — please try again.");
          setStatus("error");
        }
      }
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReanalyze() {
    if (!path) return;
    setStatus("analyzing");
    try {
      const analysisResult = await analyzeClothingPhoto(path);
      setAnalysis("error" in analysisResult ? null : analysisResult.data.analysis);
    } catch {
      // Same reasoning as run()'s catch above -- a thrown (not returned)
      // failure here must not leave the card stuck on "Analyzing with
      // AI..." forever. The photo is already uploaded, so degrade to
      // manual review rather than a dead end.
      setAnalysis(null);
    }
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
      <img src={previewUrl} alt="" className="h-32 w-32 shrink-0 rounded-lg object-cover" />
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
            <motion.p
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } }}
              className="text-sm text-ink-secondary"
            >
              Analyzing with AI…
            </motion.p>
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
