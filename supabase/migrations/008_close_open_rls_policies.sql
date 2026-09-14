-- The anon key ships in the public frontend bundle by design, so row level
-- security is the only thing keeping data private. Twenty tables carried a
-- permissive "using (true) with check (true)" policy for every role. Policies
-- are OR-combined, so that one policy overrode the correct auth.uid() policies
-- next to it and left the data readable and writable without logging in.

-- 1. Tables whose only policy was the open one get an owner-scoped policy
--    first, so the signed-in app keeps full access to its own rows.
create policy own_rows on public.cardio_activities for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on public.cardio_goals for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on public.custom_foods for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on public.routines for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on public.routine_logs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on public.calendar_events for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_rows on public.micronutrient_log for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- routine_items has no user_id; ownership comes from its parent routine.
create policy own_rows on public.routine_items for all to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_items.routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_items.routine_id and r.user_id = auth.uid()));

-- 2. Remove every open policy.
drop policy if exists allow_all_calendar_events on public.calendar_events;
drop policy if exists allow_all_cardio_activities on public.cardio_activities;
drop policy if exists allow_all_cardio_goals on public.cardio_goals;
drop policy if exists allow_all_chat_messages on public.chat_messages;
drop policy if exists allow_all_custom_foods on public.custom_foods;
drop policy if exists allow_all_daily_todos on public.daily_todos;
drop policy if exists anon_read_garmin_health_data on public.garmin_health_data;
drop policy if exists allow_all_micronutrient_log on public.micronutrient_log;
drop policy if exists allow_all_nutrition_log on public.nutrition_log;
drop policy if exists allow_all_routine_items on public.routine_items;
drop policy if exists allow_all_routine_logs on public.routine_logs;
drop policy if exists allow_all_routines on public.routines;
drop policy if exists allow_all_sport_todos on public.sport_todos;
drop policy if exists allow_all_training_exercises on public.training_exercises;
drop policy if exists allow_all_training_logs on public.training_logs;
drop policy if exists allow_all_training_plans on public.training_plans;
drop policy if exists allow_all_user_profiles on public.user_profiles;
drop policy if exists allow_all_water_log on public.water_log;
drop policy if exists allow_all_weekly_reports on public.weekly_reports;
drop policy if exists allow_all_weight_log on public.weight_log;
