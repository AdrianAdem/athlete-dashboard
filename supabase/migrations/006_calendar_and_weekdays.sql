-- Calendar events (synced from Google Calendar via MCP)
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  google_event_id TEXT UNIQUE,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  color TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_events_user_date ON calendar_events(user_id, start_time);
CREATE INDEX idx_calendar_events_google ON calendar_events(google_event_id);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_calendar_events" ON calendar_events FOR ALL USING (true) WITH CHECK (true);

-- Add weekdays to routines (0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr, 5=Sa, 6=So)
-- NULL or empty = every day
ALTER TABLE routines ADD COLUMN IF NOT EXISTS weekdays INTEGER[] DEFAULT NULL;

-- Custom foods (user-saved foods for quick access)
CREATE TABLE custom_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  calories_100 INTEGER NOT NULL DEFAULT 0,
  protein_100 REAL NOT NULL DEFAULT 0,
  carbs_100 REAL NOT NULL DEFAULT 0,
  fat_100 REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_custom_foods_user ON custom_foods(user_id);

ALTER TABLE custom_foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_custom_foods" ON custom_foods FOR ALL USING (true) WITH CHECK (true);

-- Micronutrient tracking (daily totals, manually or via foods)
CREATE TABLE micronutrient_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  vitamin_a_mcg REAL NOT NULL DEFAULT 0,
  vitamin_c_mg REAL NOT NULL DEFAULT 0,
  vitamin_d_mcg REAL NOT NULL DEFAULT 0,
  vitamin_e_mg REAL NOT NULL DEFAULT 0,
  vitamin_k_mcg REAL NOT NULL DEFAULT 0,
  vitamin_b12_mcg REAL NOT NULL DEFAULT 0,
  iron_mg REAL NOT NULL DEFAULT 0,
  calcium_mg REAL NOT NULL DEFAULT 0,
  magnesium_mg REAL NOT NULL DEFAULT 0,
  zinc_mg REAL NOT NULL DEFAULT 0,
  potassium_mg REAL NOT NULL DEFAULT 0,
  sodium_mg REAL NOT NULL DEFAULT 0,
  fiber_g REAL NOT NULL DEFAULT 0,
  omega3_mg REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE micronutrient_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_micronutrient_log" ON micronutrient_log FOR ALL USING (true) WITH CHECK (true);
