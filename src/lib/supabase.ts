import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { demoClient, IS_DEMO } from "./demo-client";
import { isNative } from "./platform";
import { preferencesStorage } from "./native-storage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!IS_DEMO && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error("Missing Supabase environment variables");
}

// Demo mode swaps in an in-memory client so the app runs with no backend at all
// (`npm run demo`). The stub covers the query surface this app uses; the cast
// keeps every call site unchanged.
export const supabase: SupabaseClient = IS_DEMO
  ? (demoClient as unknown as SupabaseClient)
  : createClient(
      supabaseUrl,
      supabaseAnonKey,
      isNative
        ? {
            // The shell is not a browser address bar: links come back as
            // deep links (see deep-links.ts), so PKCE with an explicit code
            // exchange replaces reading tokens from the URL hash.
            auth: {
              flowType: "pkce",
              detectSessionInUrl: false,
              storage: preferencesStorage,
            },
          }
        : undefined,
    );

/** Auth headers for edge-function calls: the user's JWT when signed in. */
export async function functionHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
