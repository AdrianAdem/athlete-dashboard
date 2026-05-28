// Garmin Connect service — browser-based SSO login + edge function for API calls

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const GARMIN_API = `${SUPABASE_URL}/functions/v1/garmin-sync`;

// No SSO popup needed — direct credential login via DI OAuth2

async function garminFetch(endpoint: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${GARMIN_API}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Garmin API error: ${res.status}`);
  }
  return res.json();
}

export async function getGarminStatus(): Promise<{
  connected: boolean;
  expires_at: number | null;
  expired: boolean;
}> {
  return garminFetch("status");
}

/**
 * Direct credential login via edge function.
 * Edge function uses DI OAuth2 password grant — no SSO popup needed.
 */
export async function loginGarmin(email: string, password: string): Promise<{ success: boolean; expiresIn: number }> {
  return garminFetch("login", { email, password });
}

export async function syncGarminHealth(date?: string): Promise<Record<string, unknown>> {
  return garminFetch("sync", date ? { date } : {});
}

export async function bulkSyncGarmin(days = 7): Promise<{ synced: number; results: unknown[] }> {
  return garminFetch("bulk-sync", { days });
}

// Typed health data matching edge function output
export interface GarminDailyStats {
  steps: number | null;
  distance_m: number | null;
  calories_total: number | null;
  calories_active: number | null;
  calories_bmr: number | null;
  floors_climbed: number | null;
  resting_hr: number | null;
  min_hr: number | null;
  max_hr: number | null;
  avg_stress: number | null;
  max_stress: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
  moderate_intensity_min: number | null;
  vigorous_intensity_min: number | null;
}

export interface GarminSleepData {
  start: number | null;
  end: number | null;
  duration_sec: number | null;
  deep_sec: number | null;
  light_sec: number | null;
  rem_sec: number | null;
  awake_sec: number | null;
  score: number | null;
  score_quality: string | null;
  avg_spo2: number | null;
  avg_respiration: number | null;
}

export interface GarminHRV {
  weekly_avg: number | null;
  last_night: number | null;
  last_night_5min_high: number | null;
  baseline_low: number | null;
  baseline_balanced_low: number | null;
  baseline_balanced_upper: number | null;
  status: string | null;
}

export interface GarminVO2Max {
  generic: number | null;
  running: number | null;
  cycling: number | null;
  fitness_age: number | null;
}

export interface GarminStress {
  avg: number | null;
  rest_stress_duration_sec: number | null;
  low_stress_duration_sec: number | null;
  medium_stress_duration_sec: number | null;
  high_stress_duration_sec: number | null;
}

export interface GarminHealthData {
  date: string;
  daily?: GarminDailyStats;
  sleep?: GarminSleepData;
  heart_rate?: { resting: number | null; min: number | null; max: number | null };
  hrv?: GarminHRV;
  stress?: GarminStress;
  vo2max?: GarminVO2Max;
}

export interface GarminHealthEntry {
  date: string;
  data: GarminHealthData;
}

export async function getGarminData(startDate: string, endDate: string): Promise<GarminHealthEntry[]> {
  return garminFetch("data", { start_date: startDate, end_date: endDate });
}
