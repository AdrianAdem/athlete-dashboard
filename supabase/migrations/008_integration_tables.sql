-- Integration tables that were created by hand in the Supabase dashboard and
-- never captured as a migration. Written down here so a fresh database can be
-- rebuilt from the repo and so their access rules are reviewable. Generated
-- from the live production DDL (columns, defaults, constraints, policies);
-- every statement is idempotent, so on production it changes nothing. The
-- foreign keys to auth.users that production had are dropped in 010.
--
-- Access model: the app runs without a login on the public anon key.
--   - Token tables are service-role only (RLS on, no policies). The browser
--     never sees a token.
--   - Data tables follow the app-wide single-user pattern.

create table if not exists strava_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  athlete_id bigint not null,
  athlete_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  scope text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table strava_tokens enable row level security;

-- Legacy: written by the retired garmin-sync edge function. The local sync
-- script keeps its tokens in scripts/.garmin-tokens.json instead.
create table if not exists garmin_tokens (
  user_id uuid primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  updated_at timestamptz default now(),
  oauth1_token text,
  oauth1_secret text
);
alter table garmin_tokens enable row level security;

create table if not exists garmin_health_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique (user_id, date)
);
alter table garmin_health_data enable row level security;
drop policy if exists anon_read_garmin_health_data on garmin_health_data;
create policy anon_read_garmin_health_data on garmin_health_data for select using (true);

create table if not exists cardio_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null check (source in ('strava', 'garmin', 'manual')),
  external_id text,
  activity_type text not null,
  name text,
  start_date timestamptz not null,
  elapsed_time_sec integer,
  moving_time_sec integer,
  distance_m real,
  elevation_gain_m real,
  avg_heartrate integer,
  max_heartrate integer,
  avg_speed_ms real,
  avg_pace_sec_per_km real,
  calories integer,
  raw_data jsonb,
  created_at timestamptz default now(),
  unique (user_id, source, external_id)
);
alter table cardio_activities enable row level security;
drop policy if exists allow_all_cardio_activities on cardio_activities;
create policy allow_all_cardio_activities on cardio_activities for all using (true) with check (true);

create table if not exists cardio_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_type text not null
    check (goal_type in ('weekly_km', 'monthly_km', 'weekly_count', 'monthly_count')),
  target_value numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, goal_type)
);
alter table cardio_goals enable row level security;
drop policy if exists allow_all_cardio_goals on cardio_goals;
create policy allow_all_cardio_goals on cardio_goals for all using (true) with check (true);
