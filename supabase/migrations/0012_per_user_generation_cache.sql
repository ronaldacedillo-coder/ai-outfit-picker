-- Fixes a real bug: combination_hash uniqueness was global, but the
-- cache lookup (fetchOutfitByHash in outfit-actions.ts) is scoped to the
-- current user's own rows via RLS. When two different users requested
-- the exact same combination (same items/occasion/style/rule/prompt
-- version), the second user's insert collided with the first user's
-- globally-unique row, and the fallback recovery path couldn't see that
-- row either (RLS), producing a hard, unrecoverable "Couldn't start
-- generation" error instead of either serving a cached image or
-- generating a fresh one. Confirmed live: reproduced with a real second
-- account requesting an already-generated combination.
--
-- Fix: scope uniqueness to (user_id, combination_hash) instead of just
-- combination_hash. Each user still gets their own cache hit when they
-- repeat a combination themselves (no wasted FLUX calls for the same
-- person -- the actual credit-saving behavior this table exists for),
-- and different users requesting the same combination no longer
-- collide -- each simply gets their own fresh generation, consistent
-- with the existing "generated looks are per-user, not shared catalog
-- data" design decision (migration 0007). No application code changes
-- needed -- outfit-actions.ts's cache-check and collision-recovery
-- logic already only ever look at the current user's own rows.

drop index if exists public.outfits_combination_hash_active_key;

create unique index if not exists outfits_user_combination_hash_active_key
  on public.outfits (user_id, combination_hash)
  where combination_hash is not null and generation_status <> 'failed';
