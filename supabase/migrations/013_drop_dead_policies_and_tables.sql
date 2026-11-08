-- Remove leftovers from the time the app was meant to use Supabase Auth.
--
-- 1. Policies keyed on auth.uid(): the app runs on the anon key with a fixed
--    USER_ID and never has an auth session, so auth.uid() is always null and
--    these policies match nothing. Every affected table still has its
--    allow_all / anon_read policy, so access does not change. They only made
--    every query evaluate dead conditions (Supabase advisor: 195 overlapping
--    permissive policies) and confused anyone reading the access rules.
do $$
declare
  pol record;
begin
  for pol in
    select c.relname as tbl, p.polname as name
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ilike '%auth.uid()%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ilike '%auth.uid()%'
      )
  loop
    execute format('drop policy %I on public.%I', pol.name, pol.tbl);
  end loop;
end $$;

-- 2. Tables nothing reads or writes any more, all empty when dropped:
--    calendar_events (removed calendar feature), chat_messages (removed AI
--    chat), garmin_tokens (written only by the retired garmin-sync edge
--    function; the local script keeps its tokens in a file).
drop table if exists calendar_events;
drop table if exists chat_messages;
drop table if exists garmin_tokens;
