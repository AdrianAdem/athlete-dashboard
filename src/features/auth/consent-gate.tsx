import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { IS_DEMO } from "@/lib/demo-client";
import { hasConsent, saveConsent } from "@/lib/consent";
import { useAuth } from "@/lib/auth";

type State = "checking" | "needed" | "ok" | "error";

// Sits behind the login for every sign-in path (email, Google, Apple, existing
// accounts): health data is special-category data, and the consent has to be
// given and provable per user, not just ticked on one signup form.
export function ConsentGate({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const [state, setState] = useState<State>(IS_DEMO ? "ok" : "checking");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (IS_DEMO || attempt < 0) return;
    let cancelled = false;
    hasConsent("health_data")
      .then((ok) => !cancelled && setState(ok ? "ok" : "needed"))
      .catch((err) => {
        console.error("Consent check failed:", err);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveConsent("health_data");
      setState("ok");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state === "ok") return <>{children}</>;
  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>
    );
  }
  if (state === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-red-400">Einwilligung konnte nicht geprüft werden.</p>
        <Button
          onClick={() => {
            setState("checking");
            setAttempt((n) => n + 1);
          }}
        >
          Erneut versuchen
        </Button>
        <button onClick={() => void signOut()} className="text-xs text-neutral-500">
          Abmelden
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold">Einwilligung</h1>
        <p className="text-sm text-neutral-300">
          Die App speichert Gesundheitsdaten (Training, Ernährung, Körperwerte, Aktivitäten) in
          deinem Konto. Dafür brauche ich deine ausdrückliche Einwilligung. Du kannst sie jederzeit
          widerrufen, indem du dein Konto in den Einstellungen löschst.
        </p>
        <label className="flex items-start gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Ich habe die{" "}
            <Link to="/datenschutz" target="_blank" className="underline">
              Datenschutzerklärung
            </Link>{" "}
            und den{" "}
            <Link to="/gesundheitshinweis" target="_blank" className="underline">
              Gesundheitshinweis
            </Link>{" "}
            gelesen und willige in die Speicherung und Verarbeitung meiner Gesundheitsdaten ein.
          </span>
        </label>
        <Button className="w-full" disabled={!agreed || busy} onClick={() => void accept()}>
          {busy ? "Bitte warten..." : "Einwilligen und weiter"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button onClick={() => void signOut()} className="text-xs text-neutral-500">
          Abmelden
        </button>
      </div>
    </div>
  );
}
