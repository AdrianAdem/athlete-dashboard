// Strava API service — all calls go through Edge Functions
import { supabase } from "./supabase";
import { USER_ID } from "./constants";
import { IS_DEMO } from "./demo-client";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL + "/functions/v1";

// Edge functions answer errors with JSON too; without this check an error body
// would be returned as if it were data (e.g. `connected: undefined`).
async function stravaFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FUNCTIONS_URL}/${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Strava request failed (${res.status})`);
  return body as T;
}

function postJson(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export interface StravaStatus {
  connected: boolean;
  athlete_name: string | null;
  athlete_id: number | null;
  last_updated: string | null;
}

export async function getStravaStatus(): Promise<StravaStatus> {
  // Demo mode has no edge functions; the fixture activities are already loaded,
  // so report a connected account rather than an error state.
  if (IS_DEMO) {
    return {
      connected: true,
      athlete_name: "Demo Athlete",
      athlete_id: 0,
      last_updated: new Date().toISOString(),
    };
  }
  return stravaFetch<StravaStatus>(`strava-auth/status?user_id=${USER_ID}`);
}

export async function getStravaAuthUrl(): Promise<string> {
  if (IS_DEMO) throw new Error("Im Demo-Modus nicht verfügbar");
  const data = await stravaFetch<{ url: string }>(`strava-auth/authorize?user_id=${USER_ID}`);
  return data.url;
}

export async function disconnectStrava(): Promise<void> {
  if (IS_DEMO) throw new Error("Im Demo-Modus nicht verfügbar");
  await stravaFetch("strava-auth/disconnect", postJson({ user_id: USER_ID }));
}

export async function syncStravaActivities(): Promise<{ imported: number; skipped: number }> {
  if (IS_DEMO) return { imported: 0, skipped: 0 };
  // The edge function pages through Strava itself and only fetches activities
  // newer than the newest stored one.
  return stravaFetch("strava-sync/activities", postJson({ user_id: USER_ID }));
}

export async function getCardioActivities(limit = 50) {
  const { data, error } = await supabase
    .from("cardio_activities")
    .select("*")
    .eq("user_id", USER_ID)
    .order("start_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getActivityDetail(activityId: string) {
  if (IS_DEMO) return {};
  return stravaFetch<Record<string, unknown>>(
    "strava-sync/activity",
    postJson({ user_id: USER_ID, activity_id: activityId }),
  );
}

export async function getActivityStreams(activityId: string, keys?: string) {
  if (IS_DEMO) return {};
  return stravaFetch<Record<string, unknown[]>>(
    "strava-sync/streams",
    postJson({ user_id: USER_ID, activity_id: activityId, keys }),
  );
}

export async function saveManualActivity(activity: {
  activity_type: string;
  name: string;
  start_date: string;
  elapsed_time_sec: number;
  moving_time_sec: number;
  distance_m: number;
  elevation_gain_m: number;
  avg_pace_sec_per_km: number | null;
  avg_speed_ms: number | null;
  calories: number | null;
  raw_data: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("cardio_activities")
    .insert({
      user_id: USER_ID,
      source: "manual",
      external_id: null,
      ...activity,
      avg_heartrate: null,
      max_heartrate: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
