-- Drop all foreign key constraints referencing auth.users
-- Required because we use a fixed USER_ID without Supabase Auth

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;
ALTER TABLE daily_todos DROP CONSTRAINT IF EXISTS daily_todos_user_id_fkey;
ALTER TABLE sport_todos DROP CONSTRAINT IF EXISTS sport_todos_user_id_fkey;
ALTER TABLE training_plans DROP CONSTRAINT IF EXISTS training_plans_user_id_fkey;
ALTER TABLE training_logs DROP CONSTRAINT IF EXISTS training_logs_user_id_fkey;
ALTER TABLE nutrition_log DROP CONSTRAINT IF EXISTS nutrition_log_user_id_fkey;
ALTER TABLE water_log DROP CONSTRAINT IF EXISTS water_log_user_id_fkey;
ALTER TABLE weight_log DROP CONSTRAINT IF EXISTS weight_log_user_id_fkey;
ALTER TABLE weekly_reports DROP CONSTRAINT IF EXISTS weekly_reports_user_id_fkey;
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_user_id_fkey;
ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_user_id_fkey;
ALTER TABLE routine_logs DROP CONSTRAINT IF EXISTS routine_logs_user_id_fkey;

-- Drop the auth trigger (no longer needed)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Ensure default user exists
INSERT INTO user_profiles (id, name, calorie_goal, protein_goal, carbs_goal, fat_goal, water_goal_ml)
VALUES ('00000000-0000-0000-0000-000000000001', 'Adrian', 2500, 150, 250, 80, 3000)
ON CONFLICT (id) DO NOTHING;
