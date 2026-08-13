import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components.
 *
 * Kept in its own file (rather than sprinkled across components) so that
 * swapping database/auth providers later — per the project's
 * vendor-lock-in requirement — touches this one file, not every component
 * that needs data.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
