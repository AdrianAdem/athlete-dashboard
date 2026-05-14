-- Enable RLS on all tables to fix Supabase security warning
-- Allow all operations for anon key (personal app, no auth)

-- user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_user_profiles" ON user_profiles FOR ALL USING (true) WITH CHECK (true);

-- daily_todos
ALTER TABLE daily_todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_daily_todos" ON daily_todos FOR ALL USING (true) WITH CHECK (true);

-- sport_todos
ALTER TABLE sport_todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_sport_todos" ON sport_todos FOR ALL USING (true) WITH CHECK (true);

-- training_plans
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_training_plans" ON training_plans FOR ALL USING (true) WITH CHECK (true);

-- training_exercises
ALTER TABLE training_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_training_exercises" ON training_exercises FOR ALL USING (true) WITH CHECK (true);

-- training_logs
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_training_logs" ON training_logs FOR ALL USING (true) WITH CHECK (true);

-- nutrition_log
ALTER TABLE nutrition_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_nutrition_log" ON nutrition_log FOR ALL USING (true) WITH CHECK (true);

-- water_log
ALTER TABLE water_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_water_log" ON water_log FOR ALL USING (true) WITH CHECK (true);

-- weight_log
ALTER TABLE weight_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_weight_log" ON weight_log FOR ALL USING (true) WITH CHECK (true);

-- weekly_reports
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_weekly_reports" ON weekly_reports FOR ALL USING (true) WITH CHECK (true);

-- chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_chat_messages" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

-- routines (if exists from 003)
DO $$ BEGIN
  ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "allow_all_routines" ON routines FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE routine_items ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "allow_all_routine_items" ON routine_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE routine_logs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "allow_all_routine_logs" ON routine_logs FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
