import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireUser } from "./requireUser";

export type UserRole = "ADMIN" | "STORE" | "CUSTOMER";

// Defense-in-depth companion to RLS, not a replacement for it: this never
// trusts a role -- or a store -- sent by the client. It re-derives both
// from the caller's own authenticated session on every call, the same way
// requireRole always has. storeId is meaningless (always null) for
// ADMIN/CUSTOMER; for STORE it's the id set by an admin via the
// profiles-admin-update path (migration 0016), never anything a STORE
// session could set for itself. Returns null on any failure to authorize
// (no session, no profile row, or a role outside `allowed`) so callers can
// respond uniformly without branching on why.
export async function requireRole(
  supabase: SupabaseClient,
  allowed: UserRole[]
): Promise<{ user: User; role: UserRole; storeId: string | null } | null> {
  const user = await requireUser(supabase);
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;

  const role = profile.role as UserRole;
  if (!allowed.includes(role)) return null;

  return { user, role, storeId: (profile.store_id as string | null) ?? null };
}
