// Strava OAuth2 Edge Function
// Handles: authorize redirect, callback token exchange, status, disconnect.
//
// Every endpoint except `callback` requires the caller's Supabase JWT; the user
// is taken from it, never from the request. `callback` is a browser redirect
// from Strava and cannot carry a JWT, so it only parks the code; the link is
// completed by an authenticated `finalize` call (see handleCallback).
// Tokens never leave the server (strava-sync refreshes internally).

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

// Resolves the signed-in user from the request's bearer token, or null.
async function requireUser(req: Request): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  return error ? null : (data.user?.id ?? null);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

// Where the browser goes after Strava: the web page, or the iOS app through its
// URL scheme. Built by hand because Response.redirect only guarantees http(s).
// Must match APP_SCHEME in src/lib/platform.ts (edge functions cannot import it).
const APP_SCHEME = "de.latentdev.athlete";

function redirectToSettings(
  params: Record<string, string>,
  client: "web" | "native" = "web",
): Response {
  const query = new URLSearchParams(params);
  const location =
    client === "native"
      ? `${APP_SCHEME}://einstellungen?${query}`
      : `${appUrl()}/einstellungen?${query}`;
  return new Response(null, { status: 302, headers: { Location: location } });
}

// GET /strava-auth/authorize
// Issues a one-time state nonce and returns the Strava OAuth URL.
async function handleAuthorize(req: Request): Promise<Response> {
  const userId = await requireUser(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const state = crypto.randomUUID();
  const supabase = getSupabaseAdmin();
  // Opportunistic cleanup keeps the table from growing with abandoned flows.
  await supabase
    .from("strava_oauth_states")
    .delete()
    .lt("created_at", new Date(Date.now() - STATE_TTL_MS).toISOString());
  // The column only exists after migration 019; sending it for the web flow
  // too would break web connects if the function were deployed first.
  const isNativeClient = new URL(req.url).searchParams.get("client") === "native";
  const { error } = await supabase
    .from("strava_oauth_states")
    .insert(
      isNativeClient ? { state, user_id: userId, client: "native" } : { state, user_id: userId },
    );
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
// Browser redirect from Strava, so no JWT. It must not bind anything yet: the
// nonce only proves who STARTED the flow, not whose browser finishes it. An
// attacker could start a flow, hand the Strava link to a victim, and get the
// victim's activities attached to the attacker's account. So the callback only
// parks the code on the nonce and sends the browser back to the app, where the
// signed-in user completes the link through `finalize`.
//
// `state` alone is not enough: the attacker created it and knows it. So the
// callback also mints a one-time `claim`, stores only its hash, and hands the
// value to the browser that came back from Strava. Finalize needs both, which
// the attacker (has the state, not the claim) and the victim (has the claim,
// not the attacker's session) can never combine.
async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stravaError = url.searchParams.get("error");
  const grantedScope = url.searchParams.get("scope") ?? "";

  const supabase = getSupabaseAdmin();
  // Which front end started this flow decides where every outcome, including
  // errors, sends the browser. Unknown or missing state falls back to the web.
  let client: "web" | "native" = "web";
  if (state) {
    const { data: row } = await supabase
      .from("strava_oauth_states")
      .select("client")
      .eq("state", state)
      .maybeSingle();
    if (row?.client === "native") client = "native";
  }

  if (stravaError) return redirectToSettings({ strava: "error", reason: stravaError }, client);
  if (!code || !state) {
    return redirectToSettings({ strava: "error", reason: "missing_code" }, client);
  }
  if (!grantedScope.split(",").includes(REQUIRED_SCOPE)) {
    return redirectToSettings({ strava: "error", reason: "missing_scope" }, client);
  }

  const claim = crypto.randomUUID();
  // Only a fresh nonce without a parked code qualifies, so it cannot be replayed.
  const { data: parked } = await supabase
    .from("strava_oauth_states")
    .update({ code, scope: grantedScope, claim_hash: await sha256Hex(claim) })
    .eq("state", state)
    .is("code", null)
    .gt("created_at", new Date(Date.now() - STATE_TTL_MS).toISOString())
    .select("state")
    .maybeSingle();
  if (!parked) return redirectToSettings({ strava: "error", reason: "invalid_state" }, client);

  return redirectToSettings({ strava: "pending", state, claim }, client);
}

// POST /strava-auth/finalize {state, claim}
// Completes the link for the signed-in user, and only if that user started the
// flow. The delete is scoped to user_id, so a foreign nonce is simply not found.
async function handleFinalize(req: Request): Promise<Response> {
  const userId = await requireUser(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const state = typeof body.state === "string" ? body.state : "";
  const claim = typeof body.claim === "string" ? body.claim : "";
  if (!state || !claim) return json({ error: "invalid_state" }, 400);

  const supabase = getSupabaseAdmin();
  const { data: stateRow } = await supabase
    .from("strava_oauth_states")
    .delete()
    .eq("state", state)
    .eq("user_id", userId)
    .eq("claim_hash", await sha256Hex(claim))
    .select("code, scope, created_at")
    .maybeSingle();
  if (!stateRow?.code || Date.now() - new Date(stateRow.created_at).getTime() > STATE_TTL_MS) {
    return json({ error: "invalid_state" }, 400);
  }

  const { clientId, clientSecret } = getStravaConfig();
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: stateRow.code,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    console.error("Strava token exchange failed:", tokenRes.status);
    return json({ error: "token_exchange_failed" }, 502);
  }
  const tokenData = await tokenRes.json();
  const athleteId = Number(tokenData.athlete?.id);
  if (!Number.isFinite(athleteId)) return json({ error: "token_exchange_failed" }, 502);

  // One Strava athlete belongs to one app account. The unique index on
  // strava_owner.athlete_id backs this check against a race.
  const { data: takenBy } = await supabase
    .from("strava_owner")
    .select("user_id")
    .eq("athlete_id", athleteId)
    .neq("user_id", userId)
    .maybeSingle();
  if (takenBy) return json({ error: "athlete_in_use" }, 409);

  const { error: pinError } = await supabase
    .from("strava_owner")
    .upsert({ user_id: userId, athlete_id: athleteId }, { onConflict: "user_id" });
  if (pinError) {
    return pinError.code === "23505"
      ? json({ error: "athlete_in_use" }, 409)
      : json({ error: "save_failed" }, 500);
  }

  const { error: dbError } = await supabase.from("strava_tokens").upsert(
    {
      user_id: userId,
      athlete_id: athleteId,
      athlete_name: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`.trim(),
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
      scope: stateRow.scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (dbError) {
    console.error("Storing Strava token failed:", dbError.message);
    return json({ error: "save_failed" }, 500);
  }
  return json({ success: true });
}

// GET /strava-auth/status — connection status, no token material
async function handleStatus(req: Request): Promise<Response> {
  const userId = await requireUser(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);

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
async function handleDisconnect(req: Request): Promise<Response> {
  const userId = await requireUser(req);
  if (!userId) return json({ error: "Unauthorized" }, 401);
  const supabase = getSupabaseAdmin();
  const { data: token } = await supabase
    .from("strava_tokens")
    .select("access_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (token?.access_token) {
    await fetch("https://www.strava.com/oauth/deauthorize", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: token.access_token }),
    }).catch((err) => console.error("Strava deauthorize failed:", err));
  }

  const { error } = await supabase.from("strava_tokens").delete().eq("user_id", userId);
  if (error) return json({ error: "Disconnect failed" }, 500);
  // Release the athlete too, so the user can connect a different Strava account.
  await supabase.from("strava_owner").delete().eq("user_id", userId);
  return json({ success: true });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    switch (url.pathname.split("/").pop()) {
      case "authorize":
        return await handleAuthorize(req);
      case "callback":
        return await handleCallback(url);
      case "finalize":
        return await handleFinalize(req);
      case "status":
        return await handleStatus(req);
      case "disconnect":
        return await handleDisconnect(req);
      default:
        return json({ error: "Unknown endpoint" }, 404);
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
