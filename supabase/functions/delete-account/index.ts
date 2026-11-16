// Delete the caller's account and all their data (App Store guideline 5.1.1(v)).
// The user comes from the JWT. Deleting the auth user cascades to every table
// that has a user_id foreign key to auth.users (see migration 016).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // The client asks for the confirmation word; checking it here too means a
    // stray or scripted call with a valid token still cannot wipe an account.
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "DELETE") return json({ error: "Confirmation missing" }, 400);

    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: "Unauthorized" }, 401);
    const userId = data.user.id;

    // Revoke Strava access first; a failure must not block the deletion.
    const { data: strava } = await admin
      .from("strava_tokens")
      .select("access_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (strava?.access_token) {
      await fetch("https://www.strava.com/oauth/deauthorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ access_token: strava.access_token }),
      }).catch((err) => console.error("Strava deauthorize failed:", err));
    }

    // Tables without an auth.users foreign key are cleaned explicitly, so the
    // deletion is complete even if a cascade is missing.
    for (const table of ["strava_tokens", "strava_owner", "strava_oauth_states"]) {
      const { error: delError } = await admin.from(table).delete().eq("user_id", userId);
      if (delError) return json({ error: `Cleanup failed: ${table}` }, 500);
    }

    const { error: userError } = await admin.auth.admin.deleteUser(userId);
    if (userError) return json({ error: "Account deletion failed" }, 500);
    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
