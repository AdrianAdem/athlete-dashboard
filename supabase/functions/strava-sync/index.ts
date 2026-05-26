// Strava Sync Edge Function
// Fetches activities from Strava and stores them normalized in cardio_activities

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
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
  await supabase.from("strava_tokens").update({
    access_token: refreshData.access_token,
    refresh_token: refreshData.refresh_token,
    expires_at: refreshData.expires_at,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return { token: refreshData.access_token };
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

// POST /strava-sync/activities — fetch and store recent activities
async function handleSync(body: { user_id: string; page?: number; per_page?: number }): Promise<Response> {
  const { token, error: tokenError } = await getValidToken(body.user_id);
  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const page = body.page ?? 1;
  const perPage = Math.min(body.per_page ?? 30, 100);

  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: `Strava API: ${res.status}`, details: err }), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const activities = await res.json();
  const supabase = getSupabaseAdmin();

  let imported = 0;
  let skipped = 0;

  for (const a of activities) {
    const avgPace = a.distance > 0 && a.moving_time > 0
      ? Math.round((a.moving_time / (a.distance / 1000)))
      : null;

    const { error: upsertError } = await supabase.from("cardio_activities").upsert({
      user_id: body.user_id,
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
      avg_pace_sec_per_km: avgPace,
      calories: a.calories ? Math.round(a.calories) : null,
      raw_data: a,
    }, { onConflict: "user_id,source,external_id" });

    if (upsertError) {
      console.error("Upsert error for activity", a.id, upsertError);
      skipped++;
    } else {
      imported++;
    }
  }

  return new Response(JSON.stringify({
    imported,
    skipped,
    total_fetched: activities.length,
    has_more: activities.length === perPage,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// POST /strava-sync/activity — fetch single activity detail
async function handleActivityDetail(body: { user_id: string; activity_id: string }): Promise<Response> {
  const { token, error: tokenError } = await getValidToken(body.user_id);
  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${body.activity_id}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

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
async function handleStreams(body: { user_id: string; activity_id: string; keys?: string }): Promise<Response> {
  const { token, error: tokenError } = await getValidToken(body.user_id);
  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const keys = body.keys ?? "heartrate,latlng,altitude,velocity_smooth,cadence,time,distance";
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${body.activity_id}/streams?keys=${keys}&key_type=distance`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: `Strava Streams API: ${res.status}`, details: err }), {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
