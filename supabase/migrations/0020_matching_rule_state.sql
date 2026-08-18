-- Fixes a pre-existing, previously-undeployed gap found during the
-- inspection ahead of this expansion: migration 0009_matching_rule_state.sql
-- exists as a local file but was never actually applied to the live
-- database (confirmed via Supabase's own applied-migration history, which
-- has no matching entry). getCurrentRuleVersion() has therefore always
-- silently fallen back to 0 -- harmless today only because
-- matching_overrides is currently empty, but it means an admin's future
-- matching-rule change would not correctly invalidate the outfit-generation
-- image cache the way the design intends. Re-applying 0009's content
-- verbatim (defensively) rather than assuming it's already there.

create table if not exists public.matching_rule_state (
  id boolean primary key default true,
  version integer not null default 1,
  constraint matching_rule_state_singleton check (id)
);

insert into public.matching_rule_state (id, version)
values (true, 1)
on conflict (id) do nothing;

alter table public.matching_rule_state enable row level security;

drop policy if exists "matching_rule_state: select all authenticated" on public.matching_rule_state;
create policy "matching_rule_state: select all authenticated"
on public.matching_rule_state for select
to authenticated
using (true);

create or replace function public.bump_matching_rule_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.matching_rule_state set version = version + 1 where id = true;
  return null;
end;
$$;

drop trigger if exists on_matching_overrides_changed on public.matching_overrides;
create trigger on_matching_overrides_changed
  after insert or update or delete on public.matching_overrides
  for each statement execute function public.bump_matching_rule_version();
