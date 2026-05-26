// Strava OAuth2 Edge Function
// Handles: authorize redirect, callback token exchange, token refresh, disconnect

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function getStravaConfig() {
  return {
    clientId: Deno.env.get("STRAVA_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("STRAVA_CLIENT_SECRET") ?? "",
    redirectUri: Deno.env.get("STRAVA_REDIRECT_URI") ?? "",
  };
}

// GET /strava-auth/authorize?user_id=xxx
// Returns the Strava OAuth URL to redirect the user to
function handleAuthorize(url: URL): Response {
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { clientId, redirectUri } = getStravaConfig();
  const scope = "read,activity:read_all";
  const stravaUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${userId}`;

  return new Response(JSON.stringify({ url: stravaUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// GET /strava-auth/callback?code=xxx&state=user_id
// Exchanges code for tokens, stores in DB, redirects back to app
async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    const appUrl = Deno.env.get("APP_URL") ?? "https://adrianadem.github.io/life-manager";
    return Response.redirect(`${appUrl}/einstellungen?strava=error&reason=${error}`, 302);
  }

  if (!code || !userId) {
    return new Response(JSON.stringify({ error: "Missing code or state" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { clientId, clientSecret } = getStravaConfig();

  // Exchange code for tokens
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
    const err = await tokenRes.text();
    console.error("Strava token exchange failed:", err);
    const appUrl = Deno.env.get("APP_URL") ?? "https://adrianadem.github.io/life-manager";
    return Response.redirect(`${appUrl}/einstellungen?strava=error&reason=token_exchange_failed`, 302);
  }

  const tokenData = await tokenRes.json();
  const supabase = getSupabaseAdmin();

  // Upsert token
  const { error: dbError } = await supabase.from("strava_tokens").upsert({
    user_id: userId,
    athlete_id: tokenData.athlete.id,
    athlete_name: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`.trim(),
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    scope: "read,activity:read_all",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (dbError) {
    console.error("DB upsert error:", dbError);
  }

  const appUrl = Deno.env.get("APP_URL") ?? "https://adrianadem.github.io/life-manager";
  return Response.redirect(`${appUrl}/einstellungen?strava=connected`, 302);
}

// POST /strava-auth/refresh — refresh access token if expired
async function handleRefresh(body: { user_id: string }): Promise<Response> {
  const supabase = getSupabaseAdmin();

  const { data: token, error } = await supabase
    .from("strava_tokens")
    .select("*")
    .eq("user_id", body.user_id)
    .single();

  if (error || !token) {
    return new Response(JSON.stringify({ error: "No Strava token found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check if still valid (with 5 min buffer)
  if (token.expires_at > Math.floor(Date.now() / 1000) + 300) {
    return new Response(JSON.stringify({ access_token: token.access_token, athlete_name: token.athlete_name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Refresh
  const { clientId, clientSecret } = getStravaConfig();
  const refreshRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!refreshRes.ok) {
    return new Response(JSON.stringify({ error: "Refresh failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const refreshData = await refreshRes.json();

  await supabase.from("strava_tokens").update({
    access_token: refreshData.access_token,
    refresh_token: refreshData.refresh_token,
    expires_at: refreshData.expires_at,
    updated_at: new Date().toISOString(),
  }).eq("user_id", body.user_id);

  return new Response(JSON.stringify({
    access_token: refreshData.access_token,
    athlete_name: token.athlete_name,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// GET /strava-auth/status?user_id=xxx — check connection status
async function handleStatus(url: URL): Promise<Response> {
  const userId = url.searchParams.get("user_id");
  if (!userId) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("strava_tokens")
    .select("athlete_name, athlete_id, updated_at")
    .eq("user_id", userId)
    .single();

  return new Response(JSON.stringify({
    connected: !!data,
    athlete_name: data?.athlete_name ?? null,
    athlete_id: data?.athlete_id ?? null,
    last_updated: data?.updated_at ?? null,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// DELETE /strava-auth/disconnect — remove token + deauthorize
async function handleDisconnect(body: { user_id: string }): Promise<Response> {
  const supabase = getSupabaseAdmin();

  // Get token to deauthorize on Strava side
  const { data: token } = await supabase
    .from("strava_tokens")
    .select("access_token")
    .eq("user_id", body.user_id)
    .single();

  if (token?.access_token) {
    await fetch("https://www.strava.com/oauth/deauthorize", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `access_token=${token.access_token}`,
    }).catch(() => {});
  }

  await supabase.from("strava_tokens").delete().eq("user_id", body.user_id);

  return new Response(JSON.stringify({ success: true }), {
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

    switch (path) {
      case "authorize":
        return handleAuthorize(url);
      case "callback":
        return await handleCallback(url);
      case "refresh":
        return await handleRefresh(await req.json());
      case "status":
        return await handleStatus(url);
      case "disconnect":
        return await handleDisconnect(await req.json());
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
