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
const CONNECT_BASE = `https://connectapi.${GARMIN_DOMAIN}`;

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
  // OAuth1 credentials are long-lived (~1 year) and used to re-mint OAuth2 tokens
  oauth1_token: string;
  oauth1_secret: string;
}

async function getStoredToken(): Promise<TokenData | null> {
  const { data } = await supabaseAdmin
    .from("garmin_tokens")
    .select("access_token, refresh_token, expires_at, oauth1_token, oauth1_secret")
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
    oauth1_token: token.oauth1_token,
    oauth1_secret: token.oauth1_secret,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

async function getValidToken(): Promise<string> {
  const stored = await getStoredToken();
  if (!stored) throw new Error("Not logged in. Call /login first.");

  // Refresh if expiring within 15 min by re-running the OAuth2 exchange with
  // the long-lived OAuth1 token (Garmin OAuth2 tokens last ~1h).
  if (Date.now() > stored.expires_at - 15 * 60 * 1000) {
    if (!stored.oauth1_token) throw new Error("No OAuth1 token. Please log in again.");
    const cc = await getConsumerCredentials();
    const o2 = await exchangeOAuth2(cc, stored.oauth1_token, stored.oauth1_secret);
    const refreshed: TokenData = {
      access_token: o2.access_token,
      refresh_token: o2.refresh_token,
      expires_at: Date.now() + o2.expires_in * 1000,
      oauth1_token: stored.oauth1_token,
      oauth1_secret: stored.oauth1_secret,
    };
    await storeToken(refreshed);
    return refreshed.access_token;
  }

  return stored.access_token;
}

// ── Server-side Garmin SSO login (garth-style OAuth1 -> OAuth2) ──

const SSO = "https://sso.garmin.com/sso";
const SSO_EMBED = `${SSO}/embed`;
const OAUTH_SERVICE = "https://connectapi.garmin.com/oauth-service/oauth";
// Public consumer credentials shared by all unofficial Garmin clients.
const CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MOBILE_UA = "com.garmin.android.apps.connectmobile";

interface ConsumerCreds {
  consumer_key: string;
  consumer_secret: string;
}

// connectapi.garmin.com rate-limits aggressively per IP (429). Retry with backoff.
async function fetchRetry(url: string, init: RequestInit, tries = 4): Promise<Response> {
  let delay = 2000;
  for (let i = 0; ; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || i === tries - 1) return res;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
}

async function getConsumerCredentials(): Promise<ConsumerCreds> {
  const res = await fetch(CONSUMER_URL);
  if (!res.ok) throw new Error(`Consumer creds fetch failed: ${res.status}`);
  return res.json();
}

// RFC 3986 percent-encoding (encodeURIComponent + the 4 extra chars).
function pct(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

async function hmacSha1(key: string, base: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(base));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function oauth1Header(
  method: string,
  baseUrl: string,
  reqParams: Record<string, string>,
  cc: ConsumerCreds,
  token = "",
  tokenSecret = "",
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: cc.consumer_key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
  if (token) oauth.oauth_token = token;

  const all = { ...reqParams, ...oauth };
  const paramStr = Object.keys(all)
    .sort()
    .map((k) => `${pct(k)}=${pct(all[k])}`)
    .join("&");
  const base = `${method.toUpperCase()}&${pct(baseUrl)}&${pct(paramStr)}`;
  const signingKey = `${pct(cc.consumer_secret)}&${pct(tokenSecret)}`;
  oauth.oauth_signature = await hmacSha1(signingKey, base);

  return "OAuth " +
    Object.keys(oauth)
      .sort()
      .map((k) => `${pct(k)}="${pct(oauth[k])}"`)
      .join(", ");
}

async function exchangeOAuth2(
  cc: ConsumerCreds,
  oauth1Token: string,
  oauth1Secret: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const url = `${OAUTH_SERVICE}/exchange/user/2.0`;
  const header = await oauth1Header("POST", url, {}, cc, oauth1Token, oauth1Secret);
  const res = await fetchRetry(url, {
    method: "POST",
    headers: {
      Authorization: header,
      "User-Agent": MOBILE_UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "",
  });
  if (!res.ok) throw new Error(`OAuth2 exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function handleLogin(email: string, password: string): Promise<{ connected: true }> {
  if (!email || !password) throw new Error("Email and password required");

  // Manual cookie jar — Deno fetch does not persist cookies across calls.
  const jar = new Map<string, string>();
  const absorb = (res: Response) => {
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  // 1. Warm up: GET embed widget to seed Cloudflare + session cookies.
  const embedQs = new URLSearchParams({ id: "gauth-widget", embedWidget: "true", gauthHost: SSO });
  const embedUrl = `${SSO_EMBED}?${embedQs}`;
  let res = await fetch(embedUrl, { headers: { "User-Agent": BROWSER_UA } });
  absorb(res);
  await res.text();

  // 2. GET signin to obtain the CSRF token.
  const signinQs = new URLSearchParams({
    id: "gauth-widget",
    embedWidget: "true",
    gauthHost: SSO_EMBED,
    service: SSO_EMBED,
    source: SSO_EMBED,
    redirectAfterAccountLoginUrl: SSO_EMBED,
    redirectAfterAccountCreationUrl: SSO_EMBED,
  });
  const signinUrl = `${SSO}/signin?${signinQs}`;
  res = await fetch(signinUrl, {
    headers: { "User-Agent": BROWSER_UA, Referer: embedUrl, Cookie: cookieHeader() },
  });
  absorb(res);
  const signinHtml = await res.text();
  const csrf = signinHtml.match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error(`Login page blocked (status ${res.status}) — no CSRF token`);

  // 3. POST credentials.
  res = await fetch(signinUrl, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: signinUrl,
      Cookie: cookieHeader(),
    },
    body: new URLSearchParams({ username: email, password, embed: "true", _csrf: csrf }),
  });
  absorb(res);
  const loginHtml = await res.text();
  const ticket = loginHtml.match(/embed\?ticket=([^"]+)"/)?.[1];
  if (!ticket) {
    if (/sign in|incorrect|invalid/i.test(loginHtml)) {
      throw new Error("Falsche E-Mail/Passwort oder MFA aktiv");
    }
    throw new Error(`Kein Ticket erhalten (status ${res.status})`);
  }

  // 4. Exchange ticket for OAuth1 token (signed request, no token yet).
  const cc = await getConsumerCredentials();
  const preParams: Record<string, string> = {
    ticket,
    "login-url": SSO_EMBED,
    "accepts-mfa-tokens": "true",
  };
  const preUrl = `${OAUTH_SERVICE}/preauthorized`;
  const preHeader = await oauth1Header("GET", preUrl, preParams, cc);
  res = await fetchRetry(`${preUrl}?${new URLSearchParams(preParams)}`, {
    headers: { Authorization: preHeader, "User-Agent": MOBILE_UA },
  });
  if (!res.ok) throw new Error(`OAuth1 failed: ${res.status} ${await res.text()}`);
  const oauth1 = Object.fromEntries(new URLSearchParams(await res.text()));
  if (!oauth1.oauth_token) throw new Error("OAuth1 token missing in response");

  // 5. Exchange OAuth1 token for OAuth2 access/refresh tokens.
  const o2 = await exchangeOAuth2(cc, oauth1.oauth_token, oauth1.oauth_token_secret);

  await storeToken({
    access_token: o2.access_token,
    refresh_token: o2.refresh_token,
    expires_at: Date.now() + o2.expires_in * 1000,
    oauth1_token: oauth1.oauth_token,
    oauth1_secret: oauth1.oauth_token_secret,
  });
  return { connected: true };
}

// ── Garmin API calls ────────────────────────────────────────────

async function garminGet(path: string, token: string) {
  const res = await fetchRetry(`${CONNECT_BASE}/${path}`, {
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
