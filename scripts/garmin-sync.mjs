#!/usr/bin/env node
// Garmin Connect -> Supabase sync, run from a residential IP (your Mac).
//
// Garmin's connectapi.garmin.com gateway hard-blocks datacenter IPs (Supabase
// edge functions get 429 "Rate limited"). So login + data fetch must run here,
// on a normal residential connection. This script logs in via the garth-style
// SSO -> OAuth1 -> OAuth2 flow, pulls daily health data, and upserts it into the
// garmin_health_data table that the app reads.
//
// Usage:
//   node scripts/garmin-sync.mjs [days]      # default 7
//
// Required env (.env in project root, already gitignored):
//   GARMIN_EMAIL, GARMIN_PASSWORD
//   VITE_SUPABASE_URL  (or SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { webcrypto } from "node:crypto";

const crypto = globalThis.crypto ?? webcrypto;

// ── Minimal .env loader (no dependency on dotenv) ───────────────────
function loadEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {
    // No .env file — rely on real environment variables.
  }
}
loadEnv();

const GARMIN_EMAIL = process.env.GARMIN_EMAIL;
const GARMIN_PASSWORD = process.env.GARMIN_PASSWORD;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = "00000000-0000-0000-0000-000000000001";

function requireEnv() {
  const missing = [];
  if (!GARMIN_EMAIL) missing.push("GARMIN_EMAIL");
  if (!GARMIN_PASSWORD) missing.push("GARMIN_PASSWORD");
  if (!SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
  if (!SERVICE_ROLE) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    console.error(`Fehlende Env-Variablen: ${missing.join(", ")}`);
    console.error("Trage sie in life-manager/.env ein (siehe .env.example).");
    process.exit(1);
  }
}

// ── Garmin OAuth (garth-style) ──────────────────────────────────────
const SSO = "https://sso.garmin.com/sso";
const SSO_EMBED = `${SSO}/embed`;
const OAUTH_SERVICE = "https://connectapi.garmin.com/oauth-service/oauth";
const CONNECT_BASE = "https://connectapi.garmin.com";
const CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MOBILE_UA = "com.garmin.android.apps.connectmobile";

function pct(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

async function hmacSha1(key, base) {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(base));
  return Buffer.from(new Uint8Array(sig)).toString("base64");
}

async function oauth1Header(method, baseUrl, reqParams, cc, token = "", tokenSecret = "") {
  const oauth = {
    oauth_consumer_key: cc.consumer_key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  };
  if (token) oauth.oauth_token = token;
  const all = { ...reqParams, ...oauth };
  const paramStr = Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join("&");
  const base = `${method.toUpperCase()}&${pct(baseUrl)}&${pct(paramStr)}`;
  oauth.oauth_signature = await hmacSha1(`${pct(cc.consumer_secret)}&${pct(tokenSecret)}`, base);
  return "OAuth " + Object.keys(oauth).sort().map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(", ");
}

// OAuth1 -> OAuth2 token exchange. Used for both the initial login and for
// cheap refreshes (no full SSO) when we still hold the OAuth1 credentials.
async function exchangeOAuth2(cc, oauth1Token, oauth1Secret) {
  const exUrl = `${OAUTH_SERVICE}/exchange/user/2.0`;
  const exHeader = await oauth1Header("POST", exUrl, {}, cc, oauth1Token, oauth1Secret);
  const res = await fetch(exUrl, {
    method: "POST",
    headers: { Authorization: exHeader, "User-Agent": MOBILE_UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
  });
  if (!res.ok) throw new Error(`OAuth2-Exchange fehlgeschlagen: ${res.status} ${await res.text()}`);
  return res.json();
}

// Cache tokens locally so frequent polling doesn't trigger a full SSO login
// (and risk Garmin flagging the account) on every run.
const TOKEN_FILE = join(dirname(fileURLToPath(import.meta.url)), ".garmin-tokens.json");

function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveTokens(t) {
  writeFileSync(TOKEN_FILE, JSON.stringify(t), { mode: 0o600 });
}

async function getAccessToken() {
  const now = Date.now();
  const cached = loadTokens();
  // Valid, unexpired access token — reuse as-is.
  if (cached?.access_token && cached.expires_at > now + 60_000) {
    console.log("Token aus Cache (kein Login).");
    return cached.access_token;
  }

  const cc = await getConsumerCredentials();

  // Have OAuth1 creds — refresh without a full SSO login.
  if (cached?.oauth1_token && cached?.oauth1_secret) {
    try {
      console.log("Token-Refresh (OAuth1, kein SSO)...");
      const o2 = await exchangeOAuth2(cc, cached.oauth1_token, cached.oauth1_secret);
      saveTokens({
        access_token: o2.access_token,
        expires_at: now + (o2.expires_in ?? 3599) * 1000,
        oauth1_token: cached.oauth1_token,
        oauth1_secret: cached.oauth1_secret,
      });
      return o2.access_token;
    } catch {
      // Refresh failed (revoked/expired) — fall through to full login.
    }
  }

  console.log("Voller SSO-Login...");
  const { oauth1, o2 } = await fullLogin(cc);
  saveTokens({
    access_token: o2.access_token,
    expires_at: now + (o2.expires_in ?? 3599) * 1000,
    oauth1_token: oauth1.oauth_token,
    oauth1_secret: oauth1.oauth_token_secret,
  });
  return o2.access_token;
}

async function getConsumerCredentials() {
  return (await fetch(CONSUMER_URL)).json();
}

async function fullLogin(cc) {
  const jar = new Map();
  const absorb = (res) => {
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const embedUrl = `${SSO_EMBED}?${new URLSearchParams({ id: "gauth-widget", embedWidget: "true", gauthHost: SSO })}`;
  let res = await fetch(embedUrl, { headers: { "User-Agent": BROWSER_UA } });
  absorb(res);
  await res.text();

  const signinUrl = `${SSO}/signin?${new URLSearchParams({
    id: "gauth-widget", embedWidget: "true", gauthHost: SSO_EMBED,
    service: SSO_EMBED, source: SSO_EMBED,
    redirectAfterAccountLoginUrl: SSO_EMBED, redirectAfterAccountCreationUrl: SSO_EMBED,
  })}`;
  res = await fetch(signinUrl, { headers: { "User-Agent": BROWSER_UA, Referer: embedUrl, Cookie: cookieHeader() } });
  absorb(res);
  const csrf = (await res.text()).match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error(`Login-Seite blockiert (status ${res.status}) — kein CSRF`);

  res = await fetch(signinUrl, {
    method: "POST",
    headers: { "User-Agent": BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded", Referer: signinUrl, Cookie: cookieHeader() },
    body: new URLSearchParams({ username: GARMIN_EMAIL, password: GARMIN_PASSWORD, embed: "true", _csrf: csrf }),
  });
  absorb(res);
  const ticket = (await res.text()).match(/embed\?ticket=([^"]+)"/)?.[1];
  if (!ticket) throw new Error("Kein Ticket — falsche Zugangsdaten oder MFA aktiv");

  const preParams = { ticket, "login-url": SSO_EMBED, "accepts-mfa-tokens": "true" };
  const preHeader = await oauth1Header("GET", `${OAUTH_SERVICE}/preauthorized`, preParams, cc);
  res = await fetch(`${OAUTH_SERVICE}/preauthorized?${new URLSearchParams(preParams)}`, {
    headers: { Authorization: preHeader, "User-Agent": MOBILE_UA },
  });
  if (!res.ok) throw new Error(`OAuth1 fehlgeschlagen: ${res.status} ${await res.text()}`);
  const oauth1 = Object.fromEntries(new URLSearchParams(await res.text()));
  if (!oauth1.oauth_token) throw new Error("OAuth1-Token fehlt");

  const o2 = await exchangeOAuth2(cc, oauth1.oauth_token, oauth1.oauth_token_secret);
  return { oauth1, o2 };
}

// ── Garmin data fetch ───────────────────────────────────────────────
async function garminGet(path, token) {
  const res = await fetch(`${CONNECT_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": MOBILE_UA, Accept: "application/json", "DI-Backend": "connectapi.garmin.com" },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: ${res.status}`);
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

// Most wellness/summary endpoints key off the account's displayName, not the
// numeric user id. Fetch it once after login.
async function getDisplayName(token) {
  const profile = await garminGet("userprofile-service/socialProfile", token);
  return profile.displayName ?? profile.userName;
}

function buildResult(date, [dailyStats, sleep, heartRate, hrv, stress, vo2max]) {
  const result = { date };

  if (dailyStats.status === "fulfilled" && dailyStats.value) {
    const d = dailyStats.value;
    result.daily = {
      steps: d.totalSteps, distance_m: d.totalDistanceMeters,
      calories_total: d.totalKilocalories, calories_active: d.activeKilocalories, calories_bmr: d.bmrKilocalories,
      floors_climbed: d.floorsAscended, resting_hr: d.restingHeartRate, min_hr: d.minHeartRate, max_hr: d.maxHeartRate,
      avg_stress: d.averageStressLevel, max_stress: d.maxStressLevel,
      body_battery_high: d.bodyBatteryHighestValue, body_battery_low: d.bodyBatteryLowestValue,
      moderate_intensity_min: d.moderateIntensityMinutes, vigorous_intensity_min: d.vigorousIntensityMinutes,
    };
  }
  if (sleep.status === "fulfilled") {
    const s = sleep.value?.dailySleepDTO;
    if (s) result.sleep = {
      start: s.sleepStartTimestampLocal, end: s.sleepEndTimestampLocal, duration_sec: s.sleepTimeSeconds,
      deep_sec: s.deepSleepSeconds, light_sec: s.lightSleepSeconds, rem_sec: s.remSleepSeconds, awake_sec: s.awakeSleepSeconds,
      score: s.sleepScores?.overall?.value, score_quality: s.sleepScores?.qualityOfSleep?.qualifierKey,
      avg_spo2: s.averageSpO2Value, avg_respiration: s.averageRespirationValue,
    };
  }
  if (heartRate.status === "fulfilled" && heartRate.value) {
    const hr = heartRate.value;
    result.heart_rate = { resting: hr.restingHeartRate, min: hr.minHeartRate, max: hr.maxHeartRate };
  }
  if (hrv.status === "fulfilled") {
    const h = hrv.value?.hrvSummary ?? hrv.value;
    if (h) result.hrv = {
      weekly_avg: h.weeklyAvg, last_night: h.lastNightAvg, last_night_5min_high: h.lastNight5MinHigh,
      baseline_low: h.baseline?.lowUpper, baseline_balanced_low: h.baseline?.balancedLow, baseline_balanced_upper: h.baseline?.balancedUpper,
      status: h.status,
    };
  }
  // Stress detail endpoint only carries avg/max; the duration breakdown lives
  // in the daily summary, so source durations from there.
  if (dailyStats.status === "fulfilled" && dailyStats.value) {
    const d = dailyStats.value;
    const st = stress.status === "fulfilled" ? stress.value : null;
    result.stress = {
      avg: st?.avgStressLevel ?? d.averageStressLevel,
      rest_stress_duration_sec: d.restStressDuration,
      low_stress_duration_sec: d.lowStressDuration,
      medium_stress_duration_sec: d.mediumStressDuration,
      high_stress_duration_sec: d.highStressDuration,
    };
  }
  if (vo2max.status === "fulfilled") {
    const m = Array.isArray(vo2max.value) ? vo2max.value[0] : vo2max.value;
    const g = m?.generic;
    if (g) result.vo2max = {
      generic: g.vo2MaxPreciseValue ?? g.vo2MaxValue,
      running: m.running?.vo2MaxPreciseValue ?? m.running?.vo2MaxValue,
      cycling: m.cycling?.vo2MaxPreciseValue ?? m.cycling?.vo2MaxValue,
      fitness_age: g.fitnessAge,
    };
  }
  return result;
}

// ── Supabase upsert (service role bypasses RLS) ─────────────────────
async function upsert(date, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/garmin_health_data?on_conflict=user_id,date`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ user_id: USER_ID, date, data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${date}: ${res.status} ${await res.text()}`);
}

function fmt(d) {
  return d.toISOString().split("T")[0];
}

async function main() {
  requireEnv();
  const days = Math.max(1, Math.min(31, parseInt(process.argv[2] ?? "7", 10) || 7));

  const token = await getAccessToken();
  const displayName = await getDisplayName(token);
  console.log("Verbunden. Sync " + days + " Tage...");

  let ok = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = fmt(d);
    try {
      const parts = await Promise.allSettled([
        garminGet(`usersummary-service/usersummary/daily/${displayName}?calendarDate=${date}`, token),
        garminGet(`wellness-service/wellness/dailySleepData/${displayName}?date=${date}&nonSleepBufferMinutes=60`, token),
        garminGet(`wellness-service/wellness/dailyHeartRate/${displayName}?date=${date}`, token),
        garminGet(`hrv-service/hrv/${date}`, token),
        garminGet(`wellness-service/wellness/dailyStress/${date}`, token),
        garminGet(`metrics-service/metrics/maxmet/daily/${date}/${date}`, token),
      ]);
      const failed = parts.filter((p) => p.status === "rejected").map((p) => p.reason.message);
      if (failed.length) console.error(`  ${date}: ${failed.join(", ")}`);
      const result = buildResult(date, parts);
      await upsert(date, result);
      const steps = result.daily?.steps ?? "—";
      console.log(`  ${date}: ok (Schritte: ${steps})`);
      ok++;
    } catch (err) {
      console.error(`  ${date}: ${err.message}`);
    }
    if (i < days - 1) await new Promise((r) => setTimeout(r, 800));
  }
  console.log(`Fertig: ${ok}/${days} Tage synchronisiert.`);
}

main().catch((err) => {
  console.error("Fehler:", err.message);
  process.exit(1);
});
