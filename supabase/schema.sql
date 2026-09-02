-- ============================================================
-- Sweaty Dyno — Supabase schema
--
-- Written to live safely inside a SHARED project alongside other tools:
--   * every object is prefixed `sweaty_dyno_`, so nothing can collide
--   * write access is granted to an explicit allowlist of user ids,
--     NOT to "anyone signed in" — so other tools in this project can
--     keep sign-ups enabled without handing anyone the league books
--   * no project-wide settings need changing
--   * nothing here drops or alters objects it did not create
--
-- Run the whole file once in the SQL Editor. Safe to re-run.
-- ============================================================

-- ---------- the data ----------
create table if not exists public.sweaty_dyno_data (
  key         text primary key,
  value       jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

comment on table public.sweaty_dyno_data is
  'Sweaty Dyno league tool. One row per data file: league, managers, bank, minigames, drafts, trades, stats, players.';

-- ---------- who may edit ----------
create table if not exists public.sweaty_dyno_admins (
  user_id  uuid primary key,
  note     text,
  added_at timestamptz not null default now()
);

comment on table public.sweaty_dyno_admins is
  'Allowlist of accounts permitted to write to sweaty_dyno_data.';

create or replace function public.sweaty_dyno_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sweaty_dyno_admins where user_id = auth.uid());
$$;

-- ---------- history ----------
create table if not exists public.sweaty_dyno_history (
  id          bigserial primary key,
  key         text        not null,
  value       jsonb       not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid
);

create or replace function public.sweaty_dyno_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.sweaty_dyno_history (key, value, changed_by)
  values (old.key, old.value, auth.uid());
  return new;
end $$;

create or replace function public.sweaty_dyno_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists sweaty_dyno_touch_trg    on public.sweaty_dyno_data;
drop trigger if exists sweaty_dyno_snapshot_trg on public.sweaty_dyno_data;

create trigger sweaty_dyno_touch_trg
  before insert or update on public.sweaty_dyno_data
  for each row execute function public.sweaty_dyno_touch();

create trigger sweaty_dyno_snapshot_trg
  before update on public.sweaty_dyno_data
  for each row execute function public.sweaty_dyno_snapshot();

-- ---------- row level security ----------
alter table public.sweaty_dyno_data    enable row level security;
alter table public.sweaty_dyno_history enable row level security;
alter table public.sweaty_dyno_admins  enable row level security;

drop policy if exists sweaty_dyno_read        on public.sweaty_dyno_data;
drop policy if exists sweaty_dyno_insert      on public.sweaty_dyno_data;
drop policy if exists sweaty_dyno_update      on public.sweaty_dyno_data;
drop policy if exists sweaty_dyno_hist_read   on public.sweaty_dyno_history;
drop policy if exists sweaty_dyno_admins_read on public.sweaty_dyno_admins;

-- the league is public: anyone, signed in or not, can read it
create policy sweaty_dyno_read on public.sweaty_dyno_data
  for select to anon, authenticated using (true);

-- only allowlisted accounts can write
create policy sweaty_dyno_insert on public.sweaty_dyno_data
  for insert to authenticated with check (public.sweaty_dyno_is_admin());

create policy sweaty_dyno_update on public.sweaty_dyno_data
  for update to authenticated
  using (public.sweaty_dyno_is_admin())
  with check (public.sweaty_dyno_is_admin());

-- no delete policy at all: rows are upserted, never removed

create policy sweaty_dyno_hist_read on public.sweaty_dyno_history
  for select to anon, authenticated using (true);

-- the allowlist is readable only by people already on it
create policy sweaty_dyno_admins_read on public.sweaty_dyno_admins
  for select to authenticated using (public.sweaty_dyno_is_admin());


-- ---------- table grants ----------
-- RLS decides WHICH ROWS a role may touch; these grants decide whether the
-- role may touch the table at all. Tables created from the SQL Editor do not
-- get them automatically, and without them every request 401s with
-- "permission denied for table".
grant usage on schema public to anon, authenticated;

grant select           on public.sweaty_dyno_data    to anon, authenticated;
grant insert, update   on public.sweaty_dyno_data    to authenticated;
grant select           on public.sweaty_dyno_history to anon, authenticated;
grant select           on public.sweaty_dyno_admins  to authenticated;
grant execute on function public.sweaty_dyno_is_admin() to anon, authenticated;


-- ============================================================
-- STEP 2 — make yourself the commissioner.
-- Change the email to the one you sign into Supabase with, then run:
-- ============================================================
insert into public.sweaty_dyno_admins (user_id, note)
select id, 'commissioner'
from auth.users
where email = 'CHANGE-ME@example.com'
on conflict (user_id) do nothing;

-- Check it worked — this should return exactly one row:
-- select a.user_id, u.email from public.sweaty_dyno_admins a
--   join auth.users u on u.id = a.user_id;

-- Roll a file back to the version before its last change:
-- update public.sweaty_dyno_data d set value = h.value
-- from (select distinct on (key) key, value from public.sweaty_dyno_history
--       order by key, changed_at desc) h
-- where d.key = h.key and d.key = 'bank';
