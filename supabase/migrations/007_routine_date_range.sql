-- Add optional date range to routines
-- If both null: routine runs indefinitely
-- If start_date set: routine only active from that date
-- If end_date set: routine expires after that date
ALTER TABLE routines ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE routines ADD COLUMN IF NOT EXISTS end_date DATE;
