-- Harden the Strava OAuth flow. The app has no login, so the edge functions
-- cannot tell the owner apart from a stranger holding the public anon key and
-- function URLs. These two tables close the takeover paths that need no
-- secret: forged callbacks and binding a foreign Strava account to the slot.
-- Both are service-role only (RLS on, no policies).

-- One-time OAuth state values. /authorize issues a random nonce, /callback
-- accepts it once within its lifetime and deletes it.
create table if not exists strava_oauth_states (
  state text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table strava_oauth_states enable row level security;

-- The Strava athlete allowed to connect for a user. Set on first successful
-- connect and kept on disconnect, so a stranger cannot disconnect the owner
-- and then bind their own account. To switch Strava accounts on purpose,
-- delete this row manually.
create table if not exists strava_owner (
  user_id uuid primary key,
  athlete_id bigint not null,
  created_at timestamptz not null default now()
);
alter table strava_owner enable row level security;

-- Pin the currently connected athlete so the hardening applies immediately.
insert into strava_owner (user_id, athlete_id)
select user_id, athlete_id from strava_tokens
on conflict (user_id) do nothing;
