-- ============================================================
-- Sweaty Dyno — Supabase schema
-- Run this once in the Supabase SQL Editor.
--
-- Model: anyone may READ the league; only signed-in users may WRITE.
-- There is no public sign-up — you create the commissioner account by
-- hand, so "authenticated" effectively means "the commish".
-- ============================================================

create table if not exists public.league_data (
  key         text primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        references auth.users (id)
);

comment on table public.league_data is
  'One row per data file: league, managers, bank, minigames, drafts, trades, stats, players.';

-- stamp the writer + time automatically
create or replace function public.touch_league_data()
returns trigger language plpgsql security definer as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists league_data_touch on public.league_data;
create trigger league_data_touch
  before insert or update on public.league_data
  for each row execute function public.touch_league_data();

-- ---------- row level security ----------
alter table public.league_data enable row level security;

drop policy if exists "league is world readable"      on public.league_data;
drop policy if exists "signed-in users may insert"    on public.league_data;
drop policy if exists "signed-in users may update"    on public.league_data;

-- everyone (including anonymous visitors) can read
create policy "league is world readable"
  on public.league_data for select
  to anon, authenticated
  using (true);

-- only signed-in users can write
create policy "signed-in users may insert"
  on public.league_data for insert
  to authenticated
  with check (true);

create policy "signed-in users may update"
  on public.league_data for update
  to authenticated
  using (true) with check (true);

-- deliberately NO delete policy: rows are upserted, never removed.

-- ---------- audit trail ----------
create table if not exists public.league_data_history (
  id          bigserial primary key,
  key         text        not null,
  value       jsonb       not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid        references auth.users (id)
);

alter table public.league_data_history enable row level security;

drop policy if exists "history is world readable" on public.league_data_history;
create policy "history is world readable"
  on public.league_data_history for select
  to anon, authenticated using (true);

create or replace function public.snapshot_league_data()
returns trigger language plpgsql security definer as $$
begin
  insert into public.league_data_history (key, value, changed_by)
  values (old.key, old.value, auth.uid());
  return new;
end $$;

drop trigger if exists league_data_snapshot on public.league_data;
create trigger league_data_snapshot
  before update on public.league_data
  for each row execute function public.snapshot_league_data();

-- Roll a file back to the version before the last change:
--   update public.league_data d set value = h.value
--   from (select distinct on (key) key, value from public.league_data_history
--         order by key, changed_at desc) h
--   where d.key = h.key and d.key = 'bank';
