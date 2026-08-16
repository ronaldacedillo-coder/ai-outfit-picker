-- Adds deterministic-generation-cache columns to the existing outfits
-- table (not a new parallel table -- outfits/outfit_items already model
-- exactly "one generated visualization + its garment membership," and
-- extending in place means the existing My Looks/retry UI sees cached
-- results for free with no new plumbing).
--
-- The partial unique index deliberately excludes 'failed' rows: a failed
-- generation attempt must never permanently block that exact combination
-- from being retried under a fresh (or reused) row.

alter table public.outfits
  add column if not exists combination_hash text,
  add column if not exists rule_version integer,
  add column if not exists prompt_version integer,
  add column if not exists occasion text,
  add column if not exists style_context text;

create unique index if not exists outfits_combination_hash_active_key
  on public.outfits (combination_hash)
  where combination_hash is not null and generation_status <> 'failed';
