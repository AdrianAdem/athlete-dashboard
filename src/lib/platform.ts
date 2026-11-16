import { Capacitor } from "@capacitor/core";

/** True inside the iOS shell, false in the browser/PWA. */
export const isNative = Capacitor.isNativePlatform();

// Custom URL scheme registered in the iOS project (Info.plist). Auth mails,
// OAuth providers and Strava return to the app through it.
// Must match APP_SCHEME in supabase/functions/strava-auth/index.ts.
export const APP_SCHEME = "de.latentdev.athlete";

/** Where Supabase auth redirects should land for the current platform. */
export function authRedirectUrl(webOrigin: string, webBase: string): string {
  return isNative ? `${APP_SCHEME}://auth/callback` : `${webOrigin}${webBase}`;
}
