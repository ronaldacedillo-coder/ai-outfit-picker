import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getStorageProvider } from "@/lib/providers";
import { findMatchingOutfits } from "@/app/dashboard/matching-actions";
import { OutfitPickerView } from "@/components/outfit-picker/OutfitPickerView";
import type { DisplayCandidate } from "@/components/outfit-picker/types";

export const dynamic = "force-dynamic";

interface ClothingItemQueryRow {
  id: string;
  image_url: string;
  primary_color: string | null;
  clothing_subcategories: { name: string } | null;
}

export default async function OutfitPickerPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const supabase = await createClient();

  const { data: itemRow } = await supabase
    .from("clothing_items")
    .select("id, image_url, primary_color, clothing_subcategories(name)")
    .eq("id", itemId)
    .single();

  const result = await findMatchingOutfits(itemId);

  if (!itemRow || "error" in result) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-6 py-16">
        <Link href="/dashboard" className="text-sm text-ink-secondary underline underline-offset-2">
          ← Back to My Wardrobe
        </Link>
        <p className="rounded-md bg-danger-surface px-4 py-3 text-sm text-danger">
          {"error" in result ? result.error : "That item couldn't be found."}
        </p>
      </main>
    );
  }

  const item = itemRow as unknown as ClothingItemQueryRow;
  const clothingStorage = getStorageProvider(supabase);

  const selectedItem = {
    id: item.id,
    imageSignedUrl: await clothingStorage.getSignedUrl(item.image_url),
    subcategoryName: item.clothing_subcategories?.name ?? "",
    primaryColor: item.primary_color ?? "",
  };

  const candidates: DisplayCandidate[] = await Promise.all(
    result.data.candidates.map(async (candidate) => ({
      score: candidate.score,
      scoreBreakdown: candidate.scoreBreakdown,
      explanation: candidate.explanation,
      conflicts: candidate.conflicts,
      garments: await Promise.all(
        candidate.garments.map(async (g) => ({
          id: g.id,
          role: g.role,
          subcategory: g.subcategory,
          primaryColor: g.primaryColor,
          imageSignedUrl: await clothingStorage.getSignedUrl(g.imagePath),
        }))
      ),
    }))
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <div>
        <div className="flex gap-4 text-sm">
          <Link href="/dashboard" className="text-ink-secondary underline underline-offset-2">
            ← Back to My Wardrobe
          </Link>
          <Link href="/dashboard/looks" className="text-ink-secondary underline underline-offset-2">
            My Looks
          </Link>
        </div>
        <h1 className="mt-2 font-display text-2xl font-medium text-ink">Find outfits</h1>
      </div>
      <OutfitPickerView selectedItem={selectedItem} candidates={candidates} />
    </main>
  );
}
