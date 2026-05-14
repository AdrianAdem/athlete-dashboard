-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sport_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- user_profiles: users can only access their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- daily_todos
CREATE POLICY "Users can view own daily todos"
  ON daily_todos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily todos"
  ON daily_todos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily todos"
  ON daily_todos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily todos"
  ON daily_todos FOR DELETE USING (auth.uid() = user_id);

-- sport_todos
CREATE POLICY "Users can view own sport todos"
  ON sport_todos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sport todos"
  ON sport_todos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sport todos"
  ON sport_todos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sport todos"
  ON sport_todos FOR DELETE USING (auth.uid() = user_id);

-- training_plans
CREATE POLICY "Users can view own training plans"
  ON training_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own training plans"
  ON training_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own training plans"
  ON training_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own training plans"
  ON training_plans FOR DELETE USING (auth.uid() = user_id);

-- training_exercises (access through plan ownership)
CREATE POLICY "Users can view exercises of own plans"
  ON training_exercises FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM training_plans WHERE training_plans.id = training_exercises.plan_id AND training_plans.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert exercises to own plans"
  ON training_exercises FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM training_plans WHERE training_plans.id = plan_id AND training_plans.user_id = auth.uid()
  ));
CREATE POLICY "Users can update exercises of own plans"
  ON training_exercises FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM training_plans WHERE training_plans.id = training_exercises.plan_id AND training_plans.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete exercises of own plans"
  ON training_exercises FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM training_plans WHERE training_plans.id = training_exercises.plan_id AND training_plans.user_id = auth.uid()
  ));

-- training_logs
CREATE POLICY "Users can view own training logs"
  ON training_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own training logs"
  ON training_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own training logs"
  ON training_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own training logs"
  ON training_logs FOR DELETE USING (auth.uid() = user_id);

-- nutrition_log
CREATE POLICY "Users can view own nutrition log"
  ON nutrition_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own nutrition log"
  ON nutrition_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own nutrition log"
  ON nutrition_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own nutrition log"
  ON nutrition_log FOR DELETE USING (auth.uid() = user_id);

-- water_log
CREATE POLICY "Users can view own water log"
  ON water_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own water log"
  ON water_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own water log"
  ON water_log FOR DELETE USING (auth.uid() = user_id);

-- weight_log
CREATE POLICY "Users can view own weight log"
  ON weight_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weight log"
  ON weight_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own weight log"
  ON weight_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own weight log"
  ON weight_log FOR DELETE USING (auth.uid() = user_id);

-- weekly_reports
CREATE POLICY "Users can view own weekly reports"
  ON weekly_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weekly reports"
  ON weekly_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- chat_messages
CREATE POLICY "Users can view own chat messages"
  ON chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat messages"
  ON chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
