import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { IS_DEMO } from "./demo-client";
import { USER_ID as DEMO_USER_ID } from "./constants";

// Data code runs in event handlers and effects far from React context, so the
// id of the signed-in user lives in a module variable. It is written before the
// session state is published, and the gate renders no page without a session,
// so page code can never observe it empty.
let currentUserId: string | null = IS_DEMO ? DEMO_USER_ID : null;

export function uid(): string {
  if (!currentUserId) throw new Error("uid() called without a signed-in user");
  return currentUserId;
}

// Supabase error strings are English; map the ones users actually hit.
function germanError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-Mail oder Passwort falsch.";
  if (m.includes("email not confirmed"))
    return "E-Mail noch nicht bestätigt. Bitte den Link in der Mail öffnen.";
  if (m.includes("already registered")) return "Diese E-Mail ist schon registriert.";
  if (m.includes("password should be at least")) return "Passwort zu kurz (mindestens 8 Zeichen).";
  if (m.includes("rate limit")) return "Zu viele Versuche. Bitte kurz warten.";
  return message;
}

export type OAuthProvider = "google" | "apple";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  /** True after the user opened a password-reset link; they must set a new password. */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Resolves to an error message, or "confirm" when a confirmation mail was sent. */
  signUp: (email: string, password: string) => Promise<string | null>;
  signInWithProvider: (provider: OAuthProvider) => Promise<string | null>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  setNewPassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Supabase redirects back to the app root, under the Vite base path.
const appUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const apply = (next: Session | null) => {
      currentUserId = next?.user.id ?? (IS_DEMO ? DEMO_USER_ID : null);
      setSession(next);
      setLoading(false);
    };
    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      // A failed read must not leave the app on "Laden..." forever.
      .catch(() => apply(null));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      apply(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? germanError(error.message) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: appUrl() },
    });
    if (error) return germanError(error.message);
    return data.session ? null : "confirm";
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: appUrl() },
    });
    return error ? germanError(error.message) : null;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    return error ? germanError(error.message) : null;
  }, []);

  const setNewPassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return germanError(error.message);
    setRecovering(false);
    return null;
  }, []);

  // Per-user caches stay on the device under the user's own key (see
  // user-storage.ts), so signing out never discards an unsaved workout.
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      loading,
      recovering,
      signIn,
      signUp,
      signInWithProvider,
      sendPasswordReset,
      setNewPassword,
      signOut,
    }),
    [
      session,
      loading,
      recovering,
      signIn,
      signUp,
      signInWithProvider,
      sendPasswordReset,
      setNewPassword,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
