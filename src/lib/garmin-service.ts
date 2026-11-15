// Garmin Connect service — reads health data stored by the local sync script.
// Login + fetch happen in scripts/garmin-sync.mjs (Garmin blocks datacenter IPs,
// so it must run from a residential connection). The app reads the table
// directly via an RLS select policy; the old garmin-sync edge function was
// retired because its public /login endpoint accepted arbitrary credentials.

import { supabase } from "./supabase";
import { USER_ID } from "./constants";

// Typed health data matching the sync script's output
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
  // When the watch last uploaded to Garmin Connect (ISO, local time); set by
  // the sync script so the app can tell "no data" from "watch not syncing".
  device_last_sync?: string | null;
}

export interface GarminHealthEntry {
  date: string;
  data: GarminHealthData;
}

export async function getGarminData(
  startDate: string,
  endDate: string,
): Promise<GarminHealthEntry[]> {
  const { data, error } = await supabase
    .from("garmin_health_data")
    .select("date, data")
    .eq("user_id", USER_ID)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GarminHealthEntry[];
}
