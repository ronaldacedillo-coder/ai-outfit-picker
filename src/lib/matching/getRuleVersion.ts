import type { SupabaseClient } from "@supabase/supabase-js";

// Single-row counter (migration 0009), bumped by a trigger on every
// matching_overrides write. Falls back to 0 if the row is somehow missing
// (e.g. a fresh DB before the seed insert ran) rather than throwing --
// combination_hash still works correctly with any stable placeholder
// value, it just means the very first admin rule change is guaranteed to
// produce a new hash rather than possibly matching an old cache entry.
export async function getCurrentRuleVersion(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from("matching_rule_state").select("version").eq("id", true).single();
  return data?.version ?? 0;
}
