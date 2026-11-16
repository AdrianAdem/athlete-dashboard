import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "./supabase";
import { isNative } from "./platform";
import { parseDeepLink } from "./deep-links";
import { hasPendingCodeVerifier } from "./native-storage";
import { useAuth } from "./auth";

// The launch URL stays set for the whole process lifetime; it must be handled
// once, and a link must not run twice if the system also delivers it as an event.
let launchChecked = false;
let lastHandled = "";

/** Turns links that open the iOS app (login return, Strava return) into actions. */
export function DeepLinkListener() {
  const navigate = useNavigate();
  const { reportAuthError } = useAuth();
  // Kept in refs so the listener registers once; navigate changes identity on
  // every route change and would otherwise re-run the effect and the launch URL.
  const navigateRef = useRef(navigate);
  const reportRef = useRef(reportAuthError);
  useEffect(() => {
    navigateRef.current = navigate;
    reportRef.current = reportAuthError;
  });

  useEffect(() => {
    if (!isNative) return;

    const handle = async (rawUrl: string) => {
      if (rawUrl === lastHandled) return;
      lastHandled = rawUrl;
      const link = parseDeepLink(rawUrl);
      if (link.kind === "ignore") return;
      // The system browser sheet used for OAuth/Strava stays open otherwise.
      await Browser.close().catch(() => {});
      if (link.kind === "auth") {
        // Any app or web page can open this URL. Without a login flow started
        // here (a stored PKCE verifier) the code is not ours, and exchanging it
        // would only destroy the verifier of a real flow in progress.
        if (!(await hasPendingCodeVerifier())) return;
        // Recovery links also arrive here; supabase-js then emits
        // PASSWORD_RECOVERY, which the auth gate already handles.
        const { error } = await supabase.auth.exchangeCodeForSession(link.code);
        if (error) reportRef.current(error.message);
      } else if (link.kind === "auth-error") {
        reportRef.current(link.message);
      } else {
        navigateRef.current(link.path);
      }
    };

    const subscription = App.addListener("appUrlOpen", (event) => void handle(event.url));
    if (!launchChecked) {
      launchChecked = true;
      void App.getLaunchUrl().then((launch) => {
        if (launch?.url) void handle(launch.url);
      });
    }
    return () => {
      void subscription.then((h) => h.remove());
    };
  }, []);

  return null;
}
