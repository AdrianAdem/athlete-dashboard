// Strava Sync Edge Function
// Fetches activities from Strava and stores them normalized in cardio_activities

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Single-user app: requests for any other id are refused so strangers cannot
// run syncs (and burn Strava quota) under made-up ids.
const OWNER_USER_ID = Deno.env.get("OWNER_USER_ID") ?? "00000000-0000-0000-0000-000000000001";

function getSupabaseAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Ensure we have a valid access token, refresh if needed
async function getValidToken(userId: string): Promise<{ token: string; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("strava_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return { token: "", error: "Not connected to Strava" };

  // Still valid (5 min buffer)
  if (data.expires_at > Math.floor(Date.now() / 1000) + 300) {
    return { token: data.access_token };
  }

  // Refresh
  const clientId = Deno.env.get("STRAVA_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET") ?? "";

  const refreshRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!refreshRes.ok) return { token: "", error: "Token refresh failed" };

  const refreshData = await refreshRes.json();
  const { error: saveError } = await supabase
    .from("strava_tokens")
    .update({
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token,
      expires_at: refreshData.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  // Strava may rotate the refresh token on every refresh. If the new one is not
  // stored, the old one is already invalid and the connection is lost for
  // good, so surface this instead of carrying on with a one-off access token.
  if (saveError) {
    console.error("Saving refreshed Strava token failed:", saveError.message);
    return { token: "", error: "Token refresh could not be saved" };
  }

  return { token: refreshData.access_token };
}

// Strava activity ids are numeric. Anything else is rejected before it reaches
// the URL, otherwise "../../athlete" would turn into an arbitrary Strava API call
// made with the owner's token.
const ACTIVITY_ID = /^\d{1,20}$/;
const ALLOWED_STREAM_KEYS = new Set([
  "time",
  "distance",
  "latlng",
  "altitude",
  "velocity_smooth",
  "heartrate",
  "cadence",
  "watts",
  "temp",
  "moving",
  "grade_smooth",
]);

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The subset of Strava's SummaryActivity this function maps.
interface StravaActivity {
  id: number;
  type?: string;
  sport_type?: string;
  name: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed: number;
  calories?: number;
}

// Map Strava activity type to our normalized type
function normalizeActivityType(stravaType: string): string {
  const map: Record<string, string> = {
    Run: "run",
    Ride: "ride",
    Swim: "swim",
    Walk: "walk",
    Hike: "hike",
    WeightTraining: "weight_training",
    Workout: "workout",
    Yoga: "yoga",
    CrossFit: "crossfit",
    Elliptical: "elliptical",
    StairStepper: "stair_stepper",
    Rowing: "rowing",
    Kayaking: "kayaking",
    Skiing: "skiing",
    Snowboard: "snowboard",
    IceSkate: "ice_skate",
  };
  return map[stravaType] ?? stravaType.toLowerCase();
}

type ActivityRow = ReturnType<typeof toRow>;

function toRow(userId: string, a: StravaActivity) {
  return {
    user_id: userId,
    source: "strava",
    external_id: String(a.id),
    activity_type: normalizeActivityType(a.type ?? a.sport_type ?? "unknown"),
    name: a.name,
    start_date: a.start_date,
    elapsed_time_sec: a.elapsed_time,
    moving_time_sec: a.moving_time,
    distance_m: a.distance,
    elevation_gain_m: a.total_elevation_gain,
    avg_heartrate: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    max_heartrate: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    avg_speed_ms: a.average_speed,
    avg_pace_sec_per_km:
      a.distance > 0 && a.moving_time > 0 ? Math.round(a.moving_time / (a.distance / 1000)) : null,
    calories: a.calories ? Math.round(a.calories) : null,
    raw_data: a,
  };
}

// Batched upsert; if the batch is rejected, retry row by row so one malformed
// activity cannot block every other activity on the page.
async function saveRows(rows: ActivityRow[]): Promise<{ saved: number; skipped: number }> {
  if (rows.length === 0) return { saved: 0, skipped: 0 };
  const supabase = getSupabaseAdmin();
  const onConflict = { onConflict: "user_id,source,external_id" };
  const { error: batchError } = await supabase.from("cardio_activities").upsert(rows, onConflict);
  if (!batchError) return { saved: rows.length, skipped: 0 };

  console.error("Batch upsert failed, retrying per row:", batchError.message);
  let saved = 0;
  let skipped = 0;
  for (const row of rows) {
    const { error } = await supabase.from("cardio_activities").upsert(row, onConflict);
    if (error) {
      console.error("Skipped activity", row.external_id, error.message);
      skipped++;
    } else {
      saved++;
    }
  }
  return { saved, skipped };
}

const PER_PAGE = 100;
const MAX_PAGES = 10;
// Strava's `after` filters by start time, not upload time. A run recorded
// Monday but uploaded Wednesday starts before Tuesday's already-synced
// activity, so a cutoff at the newest stored start would skip it forever.
// Re-reading a two-week window catches late uploads and later edits; the
// upsert makes the overlap harmless and it usually stays one request.
const LOOKBACK_SECONDS = 14 * 24 * 60 * 60;

// POST /strava-sync/activities — import activities, all pages.
// The cutoff is fixed once before paging (recomputing it per page would shift
// the window while page 1 is saved). `after` is always sent, so Strava returns
// oldest first and an interrupted run (has_more) continues on the next sync
// without gaps. First sync or `full: true` starts at 0, i.e. everything.
async function handleSync(body: { user_id: string; full?: boolean }): Promise<Response> {
  const { token, error: tokenError } = await getValidToken(body.user_id);
  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let afterEpoch = 0;
  if (!body.full) {
    const { data: newest, error: newestError } = await getSupabaseAdmin()
      .from("cardio_activities")
      .select("start_date")
      .eq("user_id", body.user_id)
      .eq("source", "strava")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newestError) {
      return new Response(JSON.stringify({ error: "Could not read sync position" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (newest) {
      afterEpoch = Math.max(
        0,
        Math.floor(new Date(newest.start_date).getTime() / 1000) - LOOKBACK_SECONDS,
      );
    }
  }
  const after = `&after=${afterEpoch}`;

  let imported = 0;
  let skipped = 0;
  let hasMore = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${PER_PAGE}${after}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `Strava API: ${res.status}`, details: err }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const activities: StravaActivity[] = await res.json();
    const result = await saveRows(activities.map((a) => toRow(body.user_id, a)));
    imported += result.saved;
    skipped += result.skipped;
    hasMore = activities.length === PER_PAGE;
    if (!hasMore) break;
  }

  // has_more: MAX_PAGES was not enough; the next sync continues from the
  // newest stored activity (minus the lookback window).
  return new Response(JSON.stringify({ imported, skipped, has_more: hasMore }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// POST /strava-sync/activity — fetch single activity detail
async function handleActivityDetail(body: {
  user_id: string;
  activity_id: string;
}): Promise<Response> {
  if (!ACTIVITY_ID.test(String(body.activity_id))) return badRequest("Invalid activity_id");
  const { token, error: tokenError } = await getValidToken(body.user_id);
  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = await fetch(`https://www.strava.com/api/v3/activities/${body.activity_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: `Strava API: ${res.status}` }), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const activity = await res.json();
  return new Response(JSON.stringify(activity), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// POST /strava-sync/streams — fetch activity streams (HR, GPS, altitude, pace, cadence)
async function handleStreams(body: {
  user_id: string;
  activity_id: string;
  keys?: string;
}): Promise<Response> {
  if (!ACTIVITY_ID.test(String(body.activity_id))) return badRequest("Invalid activity_id");
  const requestedKeys = (
    body.keys ?? "heartrate,latlng,altitude,velocity_smooth,cadence,time,distance"
  )
    .split(",")
    .map((k) => k.trim());
  if (requestedKeys.some((k) => !ALLOWED_STREAM_KEYS.has(k))) return badRequest("Invalid keys");
  const { token, error: tokenError } = await getValidToken(body.user_id);
  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${body.activity_id}/streams?keys=${requestedKeys.join(",")}&key_type=distance`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const err = await res.text();
    return new Response(
      JSON.stringify({ error: `Strava Streams API: ${res.status}`, details: err }),
      {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const streams = await res.json();

  // Convert array of stream objects to a keyed map for easier frontend use
  const streamMap: Record<string, unknown[]> = {};
  if (Array.isArray(streams)) {
    for (const s of streams) {
      streamMap[s.type] = s.data;
    }
  }

  return new Response(JSON.stringify(streamMap), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();
    const body = await req.json();
    if (body.user_id !== OWNER_USER_ID) {
      return new Response(JSON.stringify({ error: "Unknown user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (path) {
      case "activities":
        return await handleSync(body);
      case "activity":
        return await handleActivityDetail(body);
      case "streams":
        return await handleStreams(body);
      default:
        return new Response(JSON.stringify({ error: "Unknown endpoint" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
