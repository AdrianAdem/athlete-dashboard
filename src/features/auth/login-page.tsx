import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import type { OAuthProvider } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "signin" | "signup" | "reset";

// Apple login needs the Apple Developer account (Services ID + key) configured
// in Supabase. Until then the button stays hidden instead of failing on tap.
const APPLE_ENABLED = import.meta.env.VITE_APPLE_LOGIN === "1";

const TITLES: Record<Mode, string> = {
  signin: "Anmelden",
  signup: "Konto erstellen",
  reset: "Passwort zurücksetzen",
};

export function LoginPage() {
  const { signIn, signUp, signInWithProvider, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "reset") {
        const err = await sendPasswordReset(email.trim());
        if (err) setError(err);
        else setInfo("Wenn die Adresse existiert, ist eine Mail mit einem Link unterwegs.");
        return;
      }
      const err =
        mode === "signin"
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password);
      if (err === "confirm") setInfo("Bestätigungsmail gesendet. Link öffnen, dann anmelden.");
      else if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: OAuthProvider) => {
    setError(null);
    const err = await signInWithProvider(provider);
    if (err) setError(err);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-5">
        <h1 className="text-xl font-bold">{TITLES[mode]}</h1>

        <form onSubmit={submit} className="space-y-3">
          <Input
            type="email"
            autoComplete="email"
            placeholder="E-Mail"
            aria-label="E-Mail"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode !== "reset" && (
            <Input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Passwort"
              aria-label="Passwort"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Bitte warten..." : TITLES[mode]}
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="text-sm text-green-400">
            {info}
          </p>
        )}

        {mode !== "reset" && (
          <div className="space-y-2">
            <Button variant="outline" className="w-full" onClick={() => void oauth("google")}>
              Mit Google fortfahren
            </Button>
            {APPLE_ENABLED && (
              <Button variant="outline" className="w-full" onClick={() => void oauth("apple")}>
                Mit Apple fortfahren
              </Button>
            )}
          </div>
        )}

        <div className="flex justify-between text-xs text-neutral-400">
          {mode === "signin" ? (
            <>
              <button onClick={() => switchMode("signup")}>Neues Konto</button>
              <button onClick={() => switchMode("reset")}>Passwort vergessen</button>
            </>
          ) : (
            <button onClick={() => switchMode("signin")}>Zurück zur Anmeldung</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Shown after a password-reset link was opened. */
export function NewPasswordPage() {
  const { setNewPassword } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const err = await setNewPassword(password);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3">
        <h1 className="text-xl font-bold">Neues Passwort</h1>
        <Input
          type="password"
          autoComplete="new-password"
          placeholder="Neues Passwort (min. 8 Zeichen)"
          aria-label="Neues Passwort"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={busy}>
          Speichern
        </Button>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
