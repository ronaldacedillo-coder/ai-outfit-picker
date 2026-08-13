"use client";

import { useEffect, useRef, useState } from "react";
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
      setPath(uploadResult.data.path);

      setStatus("analyzing");
      const analysisResult = await analyzeClothingPhoto(uploadResult.data.path);
      setAnalysis("error" in analysisResult ? null : analysisResult.data.analysis);
      setStatus("review");
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReanalyze() {
    if (!path) return;
    setStatus("analyzing");
    const analysisResult = await analyzeClothingPhoto(path);
    setAnalysis("error" in analysisResult ? null : analysisResult.data.analysis);
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
    <div className="flex gap-4 rounded-lg border border-neutral-200 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt="" className="h-32 w-32 rounded object-cover" />
      <div className="flex-1">
        {status === "uploading" && <p className="text-sm text-neutral-500">Uploading…</p>}
        {status === "analyzing" && <p className="text-sm text-neutral-500">Analyzing with AI…</p>}
        {status === "error" && (
          <div className="text-sm text-red-600">
            {error}
            <button className="ml-2 underline" onClick={handleCancel}>Remove</button>
          </div>
        )}
        {(status === "review" || status === "saving") && (
          <ReviewForm
            analysis={analysis}
            categories={categories}
            subcategories={subcategories}
            onSave={handleSave}
            onReanalyze={handleReanalyze}
            onCancel={handleCancel}
            saving={status === "saving"}
          />
        )}
        {status === "saved" && <p className="text-sm text-green-600">Saved to your wardrobe.</p>}
      </div>
    </div>
  );
}
