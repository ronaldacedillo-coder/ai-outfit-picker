import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireUser } from "./requireUser";

export type UserRole = "ADMIN" | "STORE" | "CUSTOMER";

// Defense-in-depth companion to RLS, not a replacement for it: this never
// trusts a role sent by the client -- it re-derives the caller's role from
// their own authenticated session on every call. Returns null on any
// failure to authorize (no session, no profile row, or a role outside
// `allowed`) so callers can respond uniformly without branching on why.
export async function requireRole(
  supabase: SupabaseClient,
  allowed: UserRole[]
): Promise<{ user: User; role: UserRole } | null> {
  const user = await requireUser(supabase);
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;

  const role = profile.role as UserRole;
  if (!allowed.includes(role)) return null;

  return { user, role };
}
