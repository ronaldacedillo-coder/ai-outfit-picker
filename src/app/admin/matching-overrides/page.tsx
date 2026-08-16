import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/requireRole";
import { AppNav } from "@/components/nav/AppNav";
import { listMatchingOverrides } from "./actions";
import { MatchingOverrideForm } from "./MatchingOverrideForm";
import { MatchingOverrideList } from "./MatchingOverrideList";

export const dynamic = "force-dynamic";

interface ItemOption {
  id: string;
  label: string;
}

export default async function MatchingOverridesPage() {
  const supabase = await createClient();
  const auth = await requireRole(supabase, ["ADMIN"]);
  if (!auth) redirect("/catalog");

  const [{ data: categories }, { data: subcategories }, { data: itemRows }, rulesResult] = await Promise.all([
    supabase.from("clothing_categories").select("id, name").order("sort_order"),
    supabase.from("clothing_subcategories").select("id, category_id, name"),
    supabase
      .from("clothing_items")
      .select("id, primary_color, clothing_subcategories(name)")
      .order("created_at", { ascending: false }),
    listMatchingOverrides(supabase),
  ]);

  const categoryOptions = (categories ?? []).map((c) => ({ id: c.id, name: c.name }));
  const subcategoryOptions = (subcategories ?? []).map((s) => ({
    id: s.id,
    categoryId: s.category_id,
    name: s.name,
  }));
  const itemOptions: ItemOption[] = (
    (itemRows ?? []) as unknown as { id: string; primary_color: string | null; clothing_subcategories: { name: string } | null }[]
  ).map((r) => ({
    id: r.id,
    label: `${r.primary_color ?? ""} ${r.clothing_subcategories?.name?.replace(/_/g, " ") ?? ""}`.trim(),
  }));

  const rules = "data" in rulesResult ? rulesResult.data.rules : [];

  return (
    <main className="mx-auto flex min-h-screen w-full min-w-0 max-w-4xl flex-col gap-8 px-6 py-16">
      <header className="flex min-w-0 flex-col gap-4 border-b border-border-subtle pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-medium text-ink">Matching Rules</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Curated combinations that always outrank the AI recommendation engine.
          </p>
        </div>
        <AppNav role="ADMIN" activePath="/admin/matching-overrides" />
      </header>

      <MatchingOverrideForm items={itemOptions} categories={categoryOptions} subcategories={subcategoryOptions} />
      <MatchingOverrideList rules={rules} items={itemOptions} categories={categoryOptions} subcategories={subcategoryOptions} />
    </main>
  );
}
