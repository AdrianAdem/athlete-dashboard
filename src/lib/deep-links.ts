import { APP_SCHEME } from "./platform";

export type DeepLink =
  | { kind: "auth"; code: string }
  | { kind: "auth-error"; message: string }
  | { kind: "route"; path: string }
  | { kind: "ignore" };

// Routes a link may open. Anything else is ignored, so a crafted link cannot
// steer the app to an arbitrary path.
const ROUTE_HOSTS = new Set(["einstellungen", "sport", "ernaehrung", "ausdauer"]);

/**
 * Interprets a URL the app was opened with, e.g.
 *   de.latentdev.athlete://auth/callback?code=...     (login, recovery, email confirm)
 *   de.latentdev.athlete://einstellungen?strava=...   (Strava returning)
 */
export function parseDeepLink(raw: string): DeepLink {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "ignore" };
  }
  if (url.protocol !== `${APP_SCHEME}:`) return { kind: "ignore" };

  if (url.hostname === "auth") {
    const code = url.searchParams.get("code");
    if (code) return { kind: "auth", code };
    // Supabase reports some failures (expired link) in the hash fragment.
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const message =
      url.searchParams.get("error_description") ??
      url.searchParams.get("error") ??
      hash.get("error_description") ??
      hash.get("error");
    return message ? { kind: "auth-error", message } : { kind: "ignore" };
  }
  if (ROUTE_HOSTS.has(url.hostname)) {
    return {
      kind: "route",
      path: `/${url.hostname}${url.pathname === "/" ? "" : url.pathname}${url.search}`,
    };
  }
  return { kind: "ignore" };
}
