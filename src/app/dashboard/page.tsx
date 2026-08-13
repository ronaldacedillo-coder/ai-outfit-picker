import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import { getStorageProvider } from "@/lib/providers";
import { UploadPanel } from "@/components/wardrobe/UploadPanel";
import { WardrobeGrid } from "@/components/wardrobe/WardrobeGrid";
import type { ClothingItemRow } from "@/lib/wardrobe/types";

export const dynamic = "force-dynamic";

// The project has no generated Supabase types (see types/database.ts --
// doesn't exist yet), so postgrest-js can't infer that these embedded
// resources are to-one relations (a single FK column per item) and
// defaults to typing them as arrays. This shape reflects the real
// cardinality from the schema.
interface ClothingItemQueryRow {
  id: string;
  image_url: string;
  category_id: number;
  subcategory_id: number;
  name: string | null;
  primary_color: string | null;
  primary_color_hex: string | null;
  secondary_colors: string[] | null;
  pattern: string | null;
  style: string | null;
  formality_level: number | null;
  description: string | null;
  clothing_categories: { name: string } | null;
  clothing_subcategories: { name: string } | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: categories }, { data: subcategories }, { data: items }] = await Promise.all([
    supabase.from("clothing_categories").select("id, name").order("sort_order"),
    supabase.from("clothing_subcategories").select("id, category_id, name"),
    supabase
      .from("clothing_items")
      .select(
        "id, image_url, category_id, subcategory_id, name, primary_color, primary_color_hex, secondary_colors, pattern, style, formality_level, description, clothing_categories(name), clothing_subcategories(name)"
      )
      .order("created_at", { ascending: false }),
  ]);

  const storage = getStorageProvider(supabase);
  const rows: ClothingItemRow[] = await Promise.all(
    ((items ?? []) as unknown as ClothingItemQueryRow[]).map(async (item) => ({
      id: item.id,
      imagePath: item.image_url,
      imageSignedUrl: await storage.getSignedUrl(item.image_url),
      categoryId: item.category_id,
      categoryName: item.clothing_categories?.name ?? "",
      subcategoryId: item.subcategory_id,
      subcategoryName: item.clothing_subcategories?.name ?? "",
      name: item.name,
      primaryColor: item.primary_color ?? "",
      primaryColorHex: item.primary_color_hex,
      secondaryColors: item.secondary_colors ?? [],
      pattern: item.pattern ?? "solid",
      style: item.style ?? "casual",
      formalityLevel: item.formality_level ?? 3,
      description: item.description ?? "",
    }))
  );

  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id, name: c.name }));
  const subcategoryOptions = (subcategories ?? []).map((s) => ({
    id: s.id,
    categoryId: s.category_id,
    name: s.name,
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My Wardrobe</h1>
          <p className="mt-1 text-sm text-neutral-500">Signed in as {user?.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <UploadPanel categories={categoryOptions} subcategories={subcategoryOptions} />
      <WardrobeGrid items={rows} categories={categoryOptions} subcategories={subcategoryOptions} />
    </main>
  );
}
