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
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Your generated outfit" className="w-full object-contain" />
      </div>

      <div className="flex flex-wrap gap-2">
        {garments.map((g) => (
          <span
            key={g.id}
            className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-stone-600"
          >
            {g.primaryColor} {g.subcategory.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-800 transition-transform duration-150 ease-out hover:bg-stone-50 active:scale-[0.97]"
        >
          Back to recommendations
        </button>
        <button
          onClick={onTryAnother}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-transform duration-150 ease-out hover:bg-stone-800 active:scale-[0.97]"
        >
          Try another outfit
        </button>
      </div>
    </div>
  );
}
