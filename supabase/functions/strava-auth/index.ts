// Strava OAuth2 Edge Function
// Handles: authorize redirect, callback token exchange, status, disconnect.
//
// The app has no login, so these endpoints are reachable by anyone who has the
// public function URL and the user id from the bundle. Two rules keep that
// from turning into account takeover or token leaks:
//   - tokens never leave the server (there is deliberately no refresh endpoint;
//     strava-sync refreshes internally),
//   - only the pinned owner athlete can bind to the slot (see strava_owner).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const REQUIRED_SCOPE = "activity:read_all";
const STATE_TTL_MS = 10 * 60 * 1000;

function getSupabaseAdmin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function getStravaConfig() {
  return {
    clientId: Deno.env.get("STRAVA_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("STRAVA_CLIENT_SECRET") ?? "",
    redirectUri: Deno.env.get("STRAVA_REDIRECT_URI") ?? "",
  };
}

function appUrl(): string {
  return Deno.env.get("APP_URL") ?? "https://adrianadem.github.io/athlete-dashboard";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function redirectToSettings(params: Record<string, string>): Response {
  return Response.redirect(`${appUrl()}/einstellungen?${new URLSearchParams(params)}`, 302);
}

// GET /strava-auth/authorize?user_id=xxx
// Issues a one-time state nonce and returns the Strava OAuth URL.
async function handleAuthorize(url: URL): Promise<Response> {
  const userId = url.searchParams.get("user_id");
  if (!userId) return json({ error: "user_id required" }, 400);

  const state = crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  // Opportunistic cleanup keeps the table from growing with abandoned flows.
  await supabase
    .from("strava_oauth_states")
    .delete()
    .lt("created_at", new Date(Date.now() - STATE_TTL_MS).toISOString());
  const { error } = await supabase.from("strava_oauth_states").insert({ state, user_id: userId });
  if (error) return json({ error: "Could not start Strava login" }, 500);

  const { clientId, redirectUri } = getStravaConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `read,${REQUIRED_SCOPE}`,
    state,
  });
  return json({ url: `https://www.strava.com/oauth/authorize?${params}` });
}

// GET /strava-auth/callback?code=xxx&state=nonce
// Validates and consumes the state, exchanges the code, enforces the owner
// pin, stores the token and redirects back to the app.
async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stravaError = url.searchParams.get("error");
  const grantedScope = url.searchParams.get("scope") ?? "";

  if (stravaError) return redirectToSettings({ strava: "error", reason: stravaError });
  if (!code || !state) return redirectToSettings({ strava: "error", reason: "missing_code" });

  const supabase = getSupabaseAdmin();

  // Consume the nonce in one statement so it can never be replayed.
  const { data: stateRow } = await supabase
    .from("strava_oauth_states")
    .delete()
    .eq("state", state)
    .select("user_id, created_at")
    .maybeSingle();
  if (!stateRow || Date.now() - new Date(stateRow.created_at).getTime() > STATE_TTL_MS) {
    return redirectToSettings({ strava: "error", reason: "invalid_state" });
  }
  const userId = stateRow.user_id as string;

  if (!grantedScope.split(",").includes(REQUIRED_SCOPE)) {
    return redirectToSettings({ strava: "error", reason: "missing_scope" });
  }

  const { clientId, clientSecret } = getStravaConfig();
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error("Strava token exchange failed:", tokenRes.status);
    return redirectToSettings({ strava: "error", reason: "token_exchange_failed" });
  }
  const tokenData = await tokenRes.json();
  const athleteId = Number(tokenData.athlete?.id);

  const { data: owner } = await supabase
    .from("strava_owner")
    .select("athlete_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (owner && Number(owner.athlete_id) !== athleteId) {
    console.error("Rejected Strava connect from non-owner athlete", athleteId);
    return redirectToSettings({ strava: "error", reason: "wrong_account" });
  }
  if (!owner) {
    const { error: pinError } = await supabase
      .from("strava_owner")
      .insert({ user_id: userId, athlete_id: athleteId });
    if (pinError) return redirectToSettings({ strava: "error", reason: "save_failed" });
  }

  const { error: dbError } = await supabase.from("strava_tokens").upsert(
    {
      user_id: userId,
      athlete_id: athleteId,
      athlete_name: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`.trim(),
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
      scope: grantedScope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (dbError) {
    console.error("Storing Strava token failed:", dbError.message);
    return redirectToSettings({ strava: "error", reason: "save_failed" });
  }

  return redirectToSettings({ strava: "connected" });
}

// GET /strava-auth/status?user_id=xxx — connection status, no token material
async function handleStatus(url: URL): Promise<Response> {
  const userId = url.searchParams.get("user_id");
  if (!userId) return json({ error: "user_id required" }, 400);

  const { data } = await getSupabaseAdmin()
    .from("strava_tokens")
    .select("athlete_name, athlete_id, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  return json({
    connected: !!data,
    athlete_name: data?.athlete_name ?? null,
    athlete_id: data?.athlete_id ?? null,
    last_updated: data?.updated_at ?? null,
  });
}

// POST /strava-auth/disconnect — remove token and deauthorize at Strava.
// Still callable without auth (no login exists), but the owner pin survives,
// so the worst a stranger can do is force a reconnect.
async function handleDisconnect(body: { user_id: string }): Promise<Response> {
  const supabase = getSupabaseAdmin();
  const { data: token } = await supabase
    .from("strava_tokens")
    .select("access_token")
    .eq("user_id", body.user_id)
    .maybeSingle();

  if (token?.access_token) {
    await fetch("https://www.strava.com/oauth/deauthorize", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token.access_token }),
    }).catch((err) => console.error("Strava deauthorize failed:", err));
  }

  const { error } = await supabase.from("strava_tokens").delete().eq("user_id", body.user_id);
  if (error) return json({ error: "Disconnect failed" }, 500);
  return json({ success: true });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    switch (url.pathname.split("/").pop()) {
      case "authorize":
        return await handleAuthorize(url);
      case "callback":
        return await handleCallback(url);
      case "status":
        return await handleStatus(url);
      case "disconnect":
        return await handleDisconnect(await req.json());
      default:
        return json({ error: "Unknown endpoint" }, 404);
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
