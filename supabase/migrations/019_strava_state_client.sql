-- Which front end started a Strava link: the web page or the iOS app. The
-- callback uses it to send the browser back to the right place.
ALTER TABLE public.strava_oauth_states
  ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT 'web'
  CHECK (client IN ('web', 'native'));
