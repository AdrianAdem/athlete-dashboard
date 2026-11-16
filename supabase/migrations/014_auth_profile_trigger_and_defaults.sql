-- Real accounts (Supabase Auth). Additive and safe while RLS is still open:
-- a signup now gets its profile row, and user_id defaults to the caller.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Omitted user_id falls back to the signed-in user. Clients still send it
-- explicitly; strict RLS (later migration) rejects any other value.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cardio_activities','cardio_goals','custom_foods','daily_todos','garmin_health_data',
    'micronutrient_log','nutrition_log','routine_logs','routines','sport_todos',
    'training_logs','training_plans','water_log','weekly_reports','weight_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET DEFAULT auth.uid()', t);
  END LOOP;
END $$;
