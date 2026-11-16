-- Per-user row-level security. Before this, every app table had an allow-all
-- policy and anyone with the public anon key could read and write everything.
--
-- Owner = auth.uid(). Tables with a user_id column compare it directly; the two
-- child tables without one (training_exercises, routine_items) go through their
-- parent. The strava_* token tables and ai_usage keep RLS on with no policy:
-- service role (edge functions) only.
--
-- Run once, in order (016 before 017). Every step drops before it creates and the
-- migration ends with checks that roll everything back if anything is left
-- open. Do NOT run it again after 017: step 1 drops every policy in public,
-- including the one on user_consents, which only 017 creates.

-- 0. Every user_id must point at a real account, or the FKs below would fail.
DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cardio_activities','cardio_goals','custom_foods','daily_todos','garmin_health_data',
    'micronutrient_log','nutrition_log','routine_logs','routines','sport_todos',
    'training_logs','training_plans','water_log','weekly_reports','weight_log',
    'strava_tokens','strava_owner','strava_oauth_states'
  ] LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I x WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id)', t)
      INTO n;
    IF n > 0 THEN RAISE EXCEPTION '% has % rows without an auth user', t, n; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.user_profiles p
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  IF n > 0 THEN RAISE EXCEPTION 'user_profiles has % rows without an auth user', n; END IF;
END $$;

-- 1. Drop every existing policy on public tables, whatever its name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2. Own-row policies for tables with user_id.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cardio_activities','cardio_goals','custom_foods','daily_todos','garmin_health_data',
    'micronutrient_log','nutrition_log','routines','sport_todos',
    'training_plans','water_log','weekly_reports','weight_log'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY own_rows ON public.%I FOR ALL TO authenticated
         USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))', t);
  END LOOP;
END $$;

-- Rows that point at a parent must point at the caller's own parent.
CREATE POLICY own_rows ON public.training_logs FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.training_exercises e
      JOIN public.training_plans p ON p.id = e.plan_id
      WHERE e.id = training_logs.exercise_id AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY own_rows ON public.routine_logs FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.routines r
                WHERE r.id = routine_logs.routine_id AND r.user_id = (SELECT auth.uid()))
  );

CREATE POLICY own_rows ON public.user_profiles FOR ALL TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY own_rows ON public.training_exercises FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_plans p
                 WHERE p.id = training_exercises.plan_id AND p.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_plans p
                      WHERE p.id = training_exercises.plan_id AND p.user_id = (SELECT auth.uid())));

CREATE POLICY own_rows ON public.routine_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routines r
                 WHERE r.id = routine_items.routine_id AND r.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.routines r
                      WHERE r.id = routine_items.routine_id AND r.user_id = (SELECT auth.uid())));

-- 3. AI usage counter (food-lookup /ai): atomic per-user hourly cap, service role only.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_ai_usage(p_user uuid, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE c integer;
BEGIN
  DELETE FROM public.ai_usage WHERE window_start < now() - interval '1 day';
  -- The WHERE on the conflict branch is the cap: at the limit nothing is
  -- updated, RETURNING yields no row and the call is refused.
  INSERT INTO public.ai_usage (user_id, window_start, n)
  VALUES (p_user, date_trunc('hour', now()), 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET n = public.ai_usage.n + 1 WHERE public.ai_usage.n < p_limit
  RETURNING n INTO c;
  RETURN c IS NOT NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bump_ai_usage(uuid, integer) FROM PUBLIC, anon, authenticated;

-- 4. Strava link flow: the callback parks the code on the nonce, `finalize`
-- completes it as the signed-in user. One athlete belongs to one account.
ALTER TABLE public.strava_oauth_states ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.strava_oauth_states ADD COLUMN IF NOT EXISTS scope text;
ALTER TABLE public.strava_oauth_states ADD COLUMN IF NOT EXISTS claim_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS strava_owner_athlete_id_key ON public.strava_owner (athlete_id);

-- 5. Anonymous visitors get nothing at all.
REVOKE ALL ON
  public.cardio_activities, public.cardio_goals, public.custom_foods, public.daily_todos,
  public.garmin_health_data, public.micronutrient_log, public.nutrition_log,
  public.routine_items, public.routine_logs, public.routines, public.sport_todos,
  public.training_exercises, public.training_logs, public.training_plans,
  public.user_profiles, public.water_log, public.weekly_reports, public.weight_log,
  public.strava_tokens, public.strava_oauth_states, public.strava_owner, public.ai_usage
FROM anon;
REVOKE ALL ON public.strava_tokens, public.strava_oauth_states, public.strava_owner, public.ai_usage
FROM authenticated;

-- 6. Deleting an account removes its data (delete-account edge function).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cardio_activities','cardio_goals','custom_foods','daily_todos','garmin_health_data',
    'micronutrient_log','nutrition_log','routine_logs','routines','sport_todos',
    'training_logs','training_plans','water_log','weekly_reports','weight_log',
    'strava_tokens','strava_owner','strava_oauth_states'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_user_id_auth_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id)
         REFERENCES auth.users(id) ON DELETE CASCADE', t, t || '_user_id_auth_fkey');
  END LOOP;
END $$;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_auth_fkey;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_id_auth_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 7. Indexes the policies and cascades rely on.
CREATE INDEX IF NOT EXISTS training_plans_user_id_idx ON public.training_plans (user_id);
CREATE INDEX IF NOT EXISTS weekly_reports_user_id_idx ON public.weekly_reports (user_id);
CREATE INDEX IF NOT EXISTS training_exercises_plan_id_idx ON public.training_exercises (plan_id);
CREATE INDEX IF NOT EXISTS routine_items_routine_id_idx ON public.routine_items (routine_id);
CREATE INDEX IF NOT EXISTS strava_oauth_states_user_id_idx ON public.strava_oauth_states (user_id);

-- 8. Post-conditions: nothing may stay open. Failure rolls the migration back.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
           WHERE schemaname = 'public' AND policyname <> 'own_rows' LOOP
    RAISE EXCEPTION 'unexpected policy % on %', r.policyname, r.tablename;
  END LOOP;
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity LOOP
    RAISE EXCEPTION 'table % has no RLS', r.tablename;
  END LOOP;
  FOR r IN SELECT tablename FROM pg_policies
           WHERE schemaname = 'public' AND roles::text NOT LIKE '%authenticated%' LOOP
    RAISE EXCEPTION 'policy on % is not limited to authenticated', r.tablename;
  END LOOP;
END $$;
