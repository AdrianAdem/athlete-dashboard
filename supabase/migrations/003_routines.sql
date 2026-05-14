-- Routines: grouped exercise/task sets (e.g. "Scapula Routine", "Morning Stretch")
CREATE TABLE routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  area TEXT NOT NULL DEFAULT 'alltag' CHECK (area IN ('alltag', 'sport')),
  category TEXT NOT NULL DEFAULT 'sonstiges' CHECK (category IN ('kraft', 'cardio', 'mobility', 'sonstiges', 'gesundheit', 'morgenroutine', 'abendroutine')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual items within a routine
CREATE TABLE routine_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  duration_sec INTEGER,
  notes TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Daily routine completion tracking
CREATE TABLE routine_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_items JSONB NOT NULL DEFAULT '[]',
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(routine_id, user_id, date)
);

CREATE INDEX idx_routines_user ON routines(user_id);
CREATE INDEX idx_routine_items_routine ON routine_items(routine_id);
CREATE INDEX idx_routine_logs_user_date ON routine_logs(user_id, date);

-- Disable RLS for personal app
ALTER TABLE routines DISABLE ROW LEVEL SECURITY;
ALTER TABLE routine_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE routine_logs DISABLE ROW LEVEL SECURITY;
