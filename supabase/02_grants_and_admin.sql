-- ============================================================
-- Run this in the Supabase SQL Editor if you already ran schema.sql
-- before the grants were added. Safe to run more than once.
--
-- Replace the email in step 2 with your Supabase account's email
-- (the one listed under Authentication -> Users). That is the only edit
-- needed -- step 3 lists every commissioner, so it takes no email.
-- ============================================================

-- 1. let the API roles touch the tables at all
grant usage on schema public to anon, authenticated;
grant select         on public.sweaty_dyno_data    to anon, authenticated;
grant insert, update on public.sweaty_dyno_data    to authenticated;
grant select         on public.sweaty_dyno_history to anon, authenticated;
grant select         on public.sweaty_dyno_admins  to authenticated;
grant execute on function public.sweaty_dyno_is_admin() to anon, authenticated;

-- 2. make yourself the commissioner
insert into public.sweaty_dyno_admins (user_id, note)
select id, 'commissioner'
from auth.users
where email = 'CHANGE-ME@example.com'
on conflict (user_id) do nothing;

-- 3. check it worked -- should return exactly one row with your email
select u.email, a.added_at
from public.sweaty_dyno_admins a
join auth.users u on u.id = a.user_id;
