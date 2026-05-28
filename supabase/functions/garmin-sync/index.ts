// Garmin Connect Unofficial API — Health Data Sync
// Endpoints: login, sync (daily stats, sleep, HR, VO2max, HRV, stress)
// Auth: SSO mobile login → DI OAuth2 token exchange
// Token cached in garmin_tokens table, auto-refreshed

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GARMIN_DOMAIN = "garmin.com";
const DI_AUTH_URL = `https://diauth.${GARMIN_DOMAIN}/di-oauth2-service/oauth/token`;
const CONNECT_BASE = `https://connect.${GARMIN_DOMAIN}`;
const DI_CLIENT_ID = "GCM_ANDROID";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const USER_ID = "00000000-0000-0000-0000-000000000001";

// ── Token management ────────────────────────────────────────────

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

async function getStoredToken(): Promise<TokenData | null> {
  const { data } = await supabaseAdmin
    .from("garmin_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", USER_ID)
    .single();
  return data ?? null;
}

async function storeToken(token: TokenData) {
  await supabaseAdmin.from("garmin_tokens").upsert({
    user_id: USER_ID,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: token.expires_at,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

async function refreshDIToken(refreshToken: string): Promise<TokenData> {
  const res = await fetch(DI_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${DI_CLIENT_ID}:`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: DI_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

async function getValidToken(): Promise<string> {
  const stored = await getStoredToken();
  if (!stored) throw new Error("Not logged in. Call /login first.");

  // Refresh if expiring within 15 min
  if (Date.now() > stored.expires_at - 15 * 60 * 1000) {
    const refreshed = await refreshDIToken(stored.refresh_token);
    await storeToken(refreshed);
    return refreshed.access_token;
  }

  return stored.access_token;
}

// ── Direct Login (DI OAuth2 password grant) ────────────────────

async function handleLogin(email: string, password: string) {
  if (!email || !password) throw new Error("Email and password required");

  const diRes = await fetch(DI_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${DI_CLIENT_ID}:`)}`,
    },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: DI_CLIENT_ID,
      username: email,
      password: password,
    }),
  });

  if (!diRes.ok) {
    const err = await diRes.text();
    throw new Error(`Garmin login failed: ${diRes.status} ${err}`);
  }

  const diData = await diRes.json();

  const token: TokenData = {
    access_token: diData.access_token,
    refresh_token: diData.refresh_token,
    expires_at: Date.now() + diData.expires_in * 1000,
  };

  await storeToken(token);

  return { success: true, expiresIn: diData.expires_in };
}

// ── Ticket Exchange (kept as fallback) ─────────────────────────

async function handleExchangeTicket(ticket: string, serviceUrl?: string) {
  if (!ticket) throw new Error("No service ticket provided");

  const svcUrl = serviceUrl ?? `${CONNECT_BASE}/modern`;

  const diRes = await fetch(DI_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${DI_CLIENT_ID}:`)}`,
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:cas-ticket",
      client_id: DI_CLIENT_ID,
      service_ticket: ticket,
      service_url: svcUrl,
    }),
  });

  if (!diRes.ok) {
    const err = await diRes.text();
    throw new Error(`DI token exchange failed: ${diRes.status} ${err}`);
  }

  const diData = await diRes.json();

  const token: TokenData = {
    access_token: diData.access_token,
    refresh_token: diData.refresh_token,
    expires_at: Date.now() + diData.expires_in * 1000,
  };

  await storeToken(token);

  return { success: true, expiresIn: diData.expires_in };
}

// ── Garmin API calls ────────────────────────────────────────────

async function garminGet(path: string, token: string) {
  const res = await fetch(`${CONNECT_BASE}/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "GCM-Android-5.23",
      Accept: "application/json",
      "DI-Backend": "connectapi.garmin.com",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Garmin API ${path}: ${res.status} ${err}`);
  }

  return res.json();
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// ── Sync handler ────────────────────────────────────────────────

async function handleSync(date?: string) {
  const token = await getValidToken();
  const targetDate = date ?? formatDate(new Date());

  // Fetch all health data in parallel
  const [dailyStats, sleep, heartRate, hrv, stress, vo2max] = await Promise.allSettled([
    garminGet(`usersummary-service/usersummary/daily/${targetDate}`, token),
    garminGet(`wellness-service/wellness/dailySleepData/${targetDate}`, token),
    garminGet(`wellness-service/wellness/dailyHeartRate/${targetDate}`, token),
    garminGet(`hrv-service/hrv/${targetDate}`, token),
    garminGet(`wellness-service/wellness/dailyStress/${targetDate}`, token),
    garminGet(`metrics-service/metrics/maxmet/daily/${targetDate}/${targetDate}`, token),
  ]);

  const result: Record<string, unknown> = { date: targetDate };

  // Daily stats (steps, calories, resting HR, etc.)
  if (dailyStats.status === "fulfilled") {
    const d = dailyStats.value;
    result.daily = {
      steps: d.totalSteps,
      distance_m: d.totalDistanceMeters,
      calories_total: d.totalKilocalories,
      calories_active: d.activeKilocalories,
      calories_bmr: d.bmrKilocalories,
      floors_climbed: d.floorsAscended,
      resting_hr: d.restingHeartRate,
      min_hr: d.minHeartRate,
      max_hr: d.maxHeartRate,
      avg_stress: d.averageStressLevel,
      max_stress: d.maxStressLevel,
      body_battery_high: d.bodyBatteryHighestValue,
      body_battery_low: d.bodyBatteryLowestValue,
      moderate_intensity_min: d.moderateIntensityMinutes,
      vigorous_intensity_min: d.vigorousIntensityMinutes,
    };
  }

  // Sleep
  if (sleep.status === "fulfilled") {
    const s = sleep.value?.dailySleepDTO;
    if (s) {
      result.sleep = {
        start: s.sleepStartTimestampLocal,
        end: s.sleepEndTimestampLocal,
        duration_sec: s.sleepTimeSeconds,
        deep_sec: s.deepSleepSeconds,
        light_sec: s.lightSleepSeconds,
        rem_sec: s.remSleepSeconds,
        awake_sec: s.awakeSleepSeconds,
        score: s.sleepScores?.overall?.value,
        score_quality: s.sleepScores?.qualityOfSleep?.qualifierKey,
        avg_spo2: s.averageSpO2Value,
        avg_respiration: s.averageRespirationValue,
      };
    }
  }

  // Heart rate
  if (heartRate.status === "fulfilled") {
    const hr = heartRate.value;
    result.heart_rate = {
      resting: hr.restingHeartRate,
      min: hr.minHeartRate,
      max: hr.maxHeartRate,
      // Timeline is large, skip for summary
    };
  }

  // HRV
  if (hrv.status === "fulfilled") {
    const h = hrv.value?.hrvSummaries?.[0] ?? hrv.value;
    if (h) {
      result.hrv = {
        weekly_avg: h.weeklyAvg,
        last_night: h.lastNightAvg,
        last_night_5min_high: h.lastNight5MinHigh,
        baseline_low: h.baseline?.lowUpper,
        baseline_balanced_low: h.baseline?.balancedLow,
        baseline_balanced_upper: h.baseline?.balancedUpper,
        status: h.status,
      };
    }
  }

  // Stress
  if (stress.status === "fulfilled") {
    const st = stress.value;
    result.stress = {
      avg: st.overallStressLevel,
      rest_stress_duration_sec: st.restStressDuration,
      low_stress_duration_sec: st.lowStressDuration,
      medium_stress_duration_sec: st.mediumStressDuration,
      high_stress_duration_sec: st.highStressDuration,
    };
  }

  // VO2max
  if (vo2max.status === "fulfilled") {
    const metrics = vo2max.value;
    const latest = Array.isArray(metrics) ? metrics[0] : metrics;
    if (latest) {
      result.vo2max = {
        generic: latest.generic?.vo2MaxPreciseValue,
        running: latest.running?.vo2MaxPreciseValue,
        cycling: latest.cycling?.vo2MaxPreciseValue,
        fitness_age: latest.generic?.fitnessAge,
      };
    }
  }

  // Store in DB
  await supabaseAdmin.from("garmin_health_data").upsert({
    user_id: USER_ID,
    date: targetDate,
    data: result,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,date" });

  return result;
}

// ── Bulk sync (last N days) ─────────────────────────────────────

async function handleBulkSync(days: number) {
  const results = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    try {
      const data = await handleSync(dateStr);
      results.push({ date: dateStr, success: true, data });
    } catch (err) {
      results.push({ date: dateStr, success: false, error: (err as Error).message });
    }
    // Small delay to avoid rate limiting
    if (i < days - 1) await new Promise((r) => setTimeout(r, 500));
  }
  return { synced: results.length, results };
}

// ── Get stored health data ──────────────────────────────────────

async function handleGetData(startDate: string, endDate: string) {
  const { data, error } = await supabaseAdmin
    .from("garmin_health_data")
    .select("date, data")
    .eq("user_id", USER_ID)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ── Router ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();
    const body = req.method === "POST" ? await req.json() : {};

    let result;
    switch (path) {
      case "login":
        result = await handleLogin(body.email, body.password);
        break;
      case "exchange-ticket":
        result = await handleExchangeTicket(body.ticket, body.service_url);
        break;
      case "sync":
        result = await handleSync(body.date);
        break;
      case "bulk-sync":
        result = await handleBulkSync(body.days ?? 7);
        break;
      case "data":
        result = await handleGetData(body.start_date, body.end_date);
        break;
      case "status": {
        const token = await getStoredToken();
        result = {
          connected: !!token,
          expires_at: token?.expires_at ?? null,
          expired: token ? Date.now() > token.expires_at : true,
        };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown endpoint" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
