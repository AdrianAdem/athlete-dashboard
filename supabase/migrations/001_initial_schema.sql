-- User profiles (extends Supabase Auth)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  birth_date DATE,
  height_cm INTEGER,
  calorie_goal INTEGER NOT NULL DEFAULT 2500,
  protein_goal INTEGER NOT NULL DEFAULT 150,
  carbs_goal INTEGER NOT NULL DEFAULT 250,
  fat_goal INTEGER NOT NULL DEFAULT 80,
  water_goal_ml INTEGER NOT NULL DEFAULT 3000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily todos
CREATE TABLE daily_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('hoch', 'mittel', 'niedrig')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sport todos
CREATE TABLE sport_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  priority TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('hoch', 'mittel', 'niedrig')),
  category TEXT NOT NULL DEFAULT 'kraft' CHECK (category IN ('kraft', 'cardio', 'mobility', 'sonstiges')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Training plans
CREATE TABLE training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Training exercises (belong to a plan)
CREATE TABLE training_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL DEFAULT '',
  sets INTEGER NOT NULL DEFAULT 3,
  reps INTEGER NOT NULL DEFAULT 10,
  day_label TEXT NOT NULL DEFAULT 'Tag A',
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Training logs
CREATE TABLE training_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES training_exercises(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  sets_completed JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nutrition log
CREATE TABLE nutrition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('frühstück', 'mittagessen', 'abendessen', 'snack')),
  food_name TEXT NOT NULL,
  barcode TEXT,
  calories INTEGER NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  fiber_g REAL NOT NULL DEFAULT 0,
  quantity_g REAL NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Water log
CREATE TABLE water_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml INTEGER NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weight log
CREATE TABLE weight_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg REAL NOT NULL,
  body_fat_percent REAL,
  muscle_mass_kg REAL,
  waist_cm REAL,
  notes TEXT
);

-- Weekly reports
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  report_json JSONB NOT NULL DEFAULT '{}',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_daily_todos_user_date ON daily_todos(user_id, due_date);
CREATE INDEX idx_sport_todos_user_date ON sport_todos(user_id, due_date);
CREATE INDEX idx_nutrition_log_user_date ON nutrition_log(user_id, date);
CREATE INDEX idx_water_log_user_date ON water_log(user_id, date);
CREATE INDEX idx_weight_log_user_date ON weight_log(user_id, date);
CREATE INDEX idx_training_logs_user_date ON training_logs(user_id, date);
CREATE INDEX idx_training_logs_exercise ON training_logs(exercise_id);
CREATE INDEX idx_training_exercises_plan ON training_exercises(plan_id);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id, created_at);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
