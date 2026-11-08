-- Same reasoning as 005_drop_auth_fk: the app runs with a fixed USER_ID that
-- is not a Supabase Auth user. These integration tables were created by hand
-- later and still pointed at auth.users, so on a fresh database every cardio
-- goal and every Garmin upsert would fail with a foreign key violation.

ALTER TABLE cardio_goals DROP CONSTRAINT IF EXISTS cardio_goals_user_id_fkey;
ALTER TABLE garmin_health_data DROP CONSTRAINT IF EXISTS garmin_health_data_user_id_fkey;
ALTER TABLE garmin_tokens DROP CONSTRAINT IF EXISTS garmin_tokens_user_id_fkey;
