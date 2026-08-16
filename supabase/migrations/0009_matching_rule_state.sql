-- Single-row version counter, bumped on any matching_overrides write. The
-- outfit-generation cache (added in a later milestone) includes this
-- version in its combination_hash, so a stale cached image generated
-- under an old admin rule is never served after the rule changes -- the
-- hash simply no longer matches, and generation runs fresh.

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
