-- One-off: move all data from the legacy fixed user to a real Supabase Auth account.
--
-- Usage: replace the two values below, run the whole block in the SQL editor
-- (or via MCP execute_sql). Run with dry_run := true first: it does everything,
-- compares row counts, then aborts on purpose, so nothing is changed.
--
-- Precondition: a backup exists (schema `bak`, taken before the move) and the
-- target account has no app data yet. The block is one transaction: any failed
-- check rolls everything back.

DO $adopt$
DECLARE
  new_id    uuid    := '00000000-0000-0000-0000-000000000000';  -- target auth.users id
  dry_run   boolean := true;
  legacy_id uuid    := '00000000-0000-0000-0000-000000000001';
  t         text;
  before_n  bigint;
  moved_n   bigint;
  existing_n bigint;
  report    text := '';
BEGIN
  IF new_id = legacy_id OR new_id = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'set new_id to the target auth user id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = new_id) THEN
    RAISE EXCEPTION 'new_id % is not in auth.users', new_id;
  END IF;

  -- Ephemeral OAuth nonces of the legacy user: drop instead of moving.
  DELETE FROM public.strava_oauth_states WHERE user_id = legacy_id;

  FOREACH t IN ARRAY ARRAY[
    'daily_todos','sport_todos','training_plans','training_logs','nutrition_log','water_log',
    'weight_log','weekly_reports','routines','routine_logs','custom_foods','micronutrient_log',
    'garmin_health_data','cardio_activities','cardio_goals','strava_tokens','strava_owner'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', t) INTO existing_n USING new_id;
    IF existing_n > 0 THEN
      RAISE EXCEPTION 'target account already has % rows in %, refusing to merge', existing_n, t;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', t) INTO before_n USING legacy_id;
    EXECUTE format('UPDATE public.%I SET user_id = $1 WHERE user_id = $2', t) USING new_id, legacy_id;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', t) INTO moved_n USING new_id;

    IF moved_n <> before_n THEN
      RAISE EXCEPTION '% : moved % of % rows', t, moved_n, before_n;
    END IF;
    report := report || format('%s=%s ', t, moved_n);
  END LOOP;

  -- Profile: the target's (empty or old) profile row makes way for the legacy one,
  -- which carries the real goals. Both are preserved in the bak schema.
  DELETE FROM public.user_profiles WHERE id = new_id;
  UPDATE public.user_profiles SET id = new_id WHERE id = legacy_id;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = new_id) THEN
    RAISE EXCEPTION 'profile was not moved';
  END IF;

  -- Nothing may remain under the legacy id.
  FOREACH t IN ARRAY ARRAY[
    'daily_todos','sport_todos','training_plans','training_logs','nutrition_log','water_log',
    'weight_log','weekly_reports','routines','routine_logs','custom_foods','micronutrient_log',
    'garmin_health_data','cardio_activities','cardio_goals','strava_tokens','strava_owner'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', t) INTO existing_n USING legacy_id;
    IF existing_n > 0 THEN
      RAISE EXCEPTION '% still has % legacy rows', t, existing_n;
    END IF;
  END LOOP;

  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN OK, rolled back. Would move: %', report;
  END IF;
  RAISE NOTICE 'moved: %', report;
END
$adopt$;

-- After a successful real run (separate statements, optional):
--   * point GARMIN_USER_ID (garmin sync script env) and the edge secret OWNER_USER_ID at new_id
--   * remove the now-unused legacy auth user:
--       DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
