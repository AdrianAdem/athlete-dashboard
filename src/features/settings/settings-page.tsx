import { useState, useEffect, useRef } from "react";
import { Save, Download, Check, AlertCircle, Link2, Unlink, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { uid, useAuth } from "@/lib/auth";
import { IS_DEMO } from "@/lib/demo-client";
import { deleteAccount } from "@/lib/account-service";
import { Browser } from "@capacitor/browser";
import { isNative } from "@/lib/platform";
import { saveExportFile } from "@/lib/export-file";
import { hasConsent, withdrawConsent } from "@/lib/consent";
import { LegalLinks } from "@/features/legal/legal-layout";
import { Input } from "@/components/ui/input";
import {
  getStravaStatus,
  finalizeStravaConnection,
  getStravaAuthUrl,
  disconnectStrava,
  syncStravaActivities,
} from "@/lib/strava-service";
import { getGarminData } from "@/lib/garmin-service";
import { cn, todayString, toLocalDateString } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Reasons strava-auth puts into the redirect after a failed connect.
const STRAVA_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Strava-Zugriff wurde abgelehnt",
  missing_scope: "Bitte Zugriff auf alle Aktivitäten erlauben",
  athlete_in_use: "Dieses Strava-Konto ist schon mit einem anderen Konto verbunden",
  invalid_state: "Login abgelaufen, bitte erneut verbinden",
  token_exchange_failed: "Strava hat den Login nicht bestätigt",
  save_failed: "Verbindung konnte nicht gespeichert werden",
};

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const finalizedState = useRef<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Strava connection state
  const [stravaStatus, setStravaStatus] = useState<{
    connected: boolean;
    athlete_name: string | null;
    last_updated: string | null;
  }>({ connected: false, athlete_name: null, last_updated: null });
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [stravaMsg, setStravaMsg] = useState<string | null>(null);

  // Garmin: data is pushed by the local sync script, so we just surface the
  // most recent synced day instead of an (impossible) in-app login.
  const [garminLastSync, setGarminLastSync] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [heightCm, setHeightCm] = useState(0);
  const [birthDate, setBirthDate] = useState("");
  const [calorieGoal, setCalorieGoal] = useState(2500);
  // null = automatic (derived from calorie goal and body weight)
  const [proteinGoal, setProteinGoal] = useState<number | null>(null);
  const [carbsGoal, setCarbsGoal] = useState<number | null>(null);
  const [fatGoal, setFatGoal] = useState<number | null>(null);
  const [waterGoal, setWaterGoal] = useState(3000);
  const { session, signOut } = useAuth();
  const [aiConsent, setAiConsent] = useState(false);
  useEffect(() => {
    if (IS_DEMO) return;
    hasConsent("ai_processing")
      .then(setAiConsent)
      .catch(() => setAiConsent(false));
  }, []);
  const withdrawAiConsent = () => {
    withdrawConsent("ai_processing")
      .then(() => setAiConsent(false))
      .catch((err: Error) => setErrorMsg(err.message));
  };
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", uid())
        .single();
      if (error) {
        console.error("Profile load error:", error);
        return;
      }
      if (data) {
        setName(data.name ?? "");
        setHeightCm(data.height_cm ?? 0);
        setBirthDate(data.birth_date ?? "");
        setCalorieGoal(data.calorie_goal);
        setProteinGoal(data.protein_goal);
        setCarbsGoal(data.carbs_goal);
        setFatGoal(data.fat_goal);
        setWaterGoal(data.water_goal_ml);
      }
    };
    loadProfile();
  }, []);

  // Strava status + callback handling
  useEffect(() => {
    const loadStatus = () =>
      getStravaStatus()
        .then(setStravaStatus)
        .catch(() => setStravaMsg("Strava-Status nicht erreichbar"));
    void loadStatus();
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    const fmt = (d: Date) => toLocalDateString(d);
    getGarminData(fmt(weekAgo), fmt(today))
      .then((entries) => {
        const latest = entries
          .map((e) => e.date)
          .sort()
          .at(-1);
        if (latest) setGarminLastSync(latest);
      })
      .catch(() => {});
    const stravaParam = searchParams.get("strava");
    const stravaState = searchParams.get("state");
    const stravaClaim = searchParams.get("claim");
    if (stravaParam === "pending" && stravaState && stravaClaim) {
      // Strava sent the browser back; finish the link as the signed-in user.
      // The one-time values leave the URL at once, and the ref stops a second
      // run (StrictMode, back navigation) from spending them twice.
      setSearchParams({}, { replace: true });
      if (finalizedState.current === stravaState) return;
      finalizedState.current = stravaState;
      setStravaMsg("Verbinde mit Strava...");
      finalizeStravaConnection(stravaState, stravaClaim)
        .then(() => {
          setStravaMsg("Strava erfolgreich verbunden!");
          return loadStatus();
        })
        .catch((err: Error) =>
          setStravaMsg(STRAVA_ERROR_MESSAGES[err.message] ?? "Strava-Verbindung fehlgeschlagen"),
        );
    } else if (stravaParam === "connected") setStravaMsg("Strava erfolgreich verbunden!");
    else if (stravaParam === "error") {
      const reason = searchParams.get("reason") ?? "";
      setStravaMsg(STRAVA_ERROR_MESSAGES[reason] ?? "Strava-Verbindung fehlgeschlagen");
    }
  }, [searchParams, setSearchParams]);

  const connectStrava = async () => {
    setStravaLoading(true);
    try {
      const url = await getStravaAuthUrl();
      // In the iOS shell the Strava login opens in the system browser sheet and
      // comes back through a deep link; a web view navigation could not return.
      if (isNative) {
        await Browser.open({ url });
        setStravaLoading(false);
      } else {
        window.location.href = url;
      }
    } catch (err) {
      setStravaMsg((err as Error).message);
      setStravaLoading(false);
    }
  };

  const handleDisconnectStrava = async () => {
    setStravaLoading(true);
    try {
      await disconnectStrava();
      setStravaStatus({ connected: false, athlete_name: null, last_updated: null });
    } catch (err) {
      setStravaMsg((err as Error).message);
    }
    setStravaLoading(false);
  };

  const handleSyncStrava = async () => {
    setStravaSyncing(true);
    try {
      const result = await syncStravaActivities();
      setStravaMsg(
        result.skipped > 0
          ? `Strava synchronisiert, ${result.skipped} Aktivitäten übersprungen`
          : "Strava synchronisiert",
      );
    } catch (err) {
      setStravaMsg(`Sync fehlgeschlagen: ${(err as Error).message}`);
    }
    setStravaSyncing(false);
    setTimeout(() => setStravaMsg(null), 3000);
  };

  const saveProfile = async () => {
    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase
      .from("user_profiles")
      .update({
        name: name.trim(),
        height_cm: heightCm || null,
        birth_date: birthDate || null,
        calorie_goal: calorieGoal,
        // 0 means the same as empty: let the formula decide.
        protein_goal: proteinGoal || null,
        carbs_goal: carbsGoal || null,
        fat_goal: fatGoal || null,
        water_goal_ml: waterGoal,
      })
      .eq("id", uid());

    if (error) {
      console.error("Profile save error:", error);
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  };

  // Full backup of everything the user owns. The earlier list missed routines,
  // cardio, custom foods, the profile and Garmin data, so the "backup" silently
  // lacked them.
  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
    } catch (err) {
      setDeleteError((err as Error).message);
      setDeleting(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const byUser = [
        "user_profiles",
        "daily_todos",
        "sport_todos",
        "training_plans",
        "training_exercises",
        "training_logs",
        "nutrition_log",
        "water_log",
        "weight_log",
        "weekly_reports",
        "routines",
        "routine_logs",
        "cardio_activities",
        "cardio_goals",
        "custom_foods",
        "garmin_health_data",
        // Legacy table the app no longer writes, still holding data.
        "micronutrient_log",
      ];
      const allData: Record<string, unknown[]> = {};
      for (const table of byUser) {
        // user_profiles is keyed by id; training_exercises hangs off plans.
        const query =
          table === "user_profiles"
            ? supabase.from(table).select("*").eq("id", uid())
            : table === "training_exercises"
              ? supabase
                  .from(table)
                  .select("*")
                  .in(
                    "plan_id",
                    ((allData.training_plans ?? []) as { id: string }[]).map((p) => p.id),
                  )
              : supabase.from(table).select("*").eq("user_id", uid());
        const { data, error } = await query;
        if (error) throw new Error(`${table}: ${error.message}`);
        allData[table] = data ?? [];
      }
      // routine_items has no user_id; it belongs to the exported routines.
      const routineIds = (allData.routines as { id: string }[]).map((r) => r.id);
      const { data: items, error: itemsError } = await supabase
        .from("routine_items")
        .select("*")
        .in("routine_id", routineIds);
      if (itemsError) throw new Error(`routine_items: ${itemsError.message}`);
      allData.routine_items = items ?? [];

      const fileName = `athlete-dashboard-export-${todayString()}.json`;
      await saveExportFile(fileName, JSON.stringify(allData, null, 2));
    } catch (err) {
      setExportMsg(`Export fehlgeschlagen: ${(err as Error).message}`);
    }
    setExporting(false);
  };

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Einstellungen</h1>

      {/* Profile */}
      <div className="rounded-xl bg-card p-4 space-y-4">
        <p className="text-sm font-medium text-neutral-400">Profil</p>
        <div className="space-y-1">
          <label className="text-xs text-neutral-500">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-neutral-800 border-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Größe (cm)</label>
            <Input
              type="number"
              value={heightCm || ""}
              onChange={(e) => setHeightCm(Number(e.target.value))}
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Geburtsdatum</label>
            {/* Native date picker yields ISO dates; free text in "TT.MM.JJJJ" was
                rejected by the DATE column and took the goal edits down with it. */}
            <Input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="bg-neutral-800 border-none"
            />
          </div>
        </div>
      </div>

      {/* Daily goals */}
      <div className="rounded-xl bg-card p-4 space-y-4">
        <p className="text-sm font-medium text-neutral-400">Tagesziele</p>
        <p className="text-xs text-neutral-600">
          Makros leer lassen = automatisch aus Kalorienziel und Körpergewicht. Richtwerte, keine
          medizinische Beratung (siehe Gesundheitshinweis).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Kalorien (kcal)</label>
            <Input
              type="number"
              value={calorieGoal}
              onChange={(e) => setCalorieGoal(Number(e.target.value))}
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Protein (g)</label>
            <Input
              type="number"
              value={proteinGoal ?? ""}
              onChange={(e) => setProteinGoal(e.target.value ? Number(e.target.value) : null)}
              placeholder="Auto"
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Kohlenhydrate (g)</label>
            <Input
              type="number"
              value={carbsGoal ?? ""}
              onChange={(e) => setCarbsGoal(e.target.value ? Number(e.target.value) : null)}
              placeholder="Auto"
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Fett (g)</label>
            <Input
              type="number"
              value={fatGoal ?? ""}
              onChange={(e) => setFatGoal(e.target.value ? Number(e.target.value) : null)}
              placeholder="Auto"
              className="bg-neutral-800 border-none"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-neutral-500">Wasser (ml)</label>
          <Input
            type="number"
            value={waterGoal}
            onChange={(e) => setWaterGoal(Number(e.target.value))}
            className="bg-neutral-800 border-none"
          />
        </div>
      </div>

      {/* Save button with status */}
      <button
        onClick={saveProfile}
        disabled={status === "saving"}
        className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
          status === "saved"
            ? "bg-green-500 text-black"
            : status === "error"
              ? "bg-red-500 text-white"
              : "bg-white text-black disabled:opacity-50"
        }`}
      >
        {status === "saving" && <Save className="h-4 w-4 animate-pulse" />}
        {status === "saved" && <Check className="h-4 w-4" />}
        {status === "error" && <AlertCircle className="h-4 w-4" />}
        {status === "idle" && <Save className="h-4 w-4" />}
        {status === "saving"
          ? "Speichern..."
          : status === "saved"
            ? "Gespeichert!"
            : status === "error"
              ? "Fehler!"
              : "Profil speichern"}
      </button>

      {status === "error" && errorMsg && (
        <p className="text-xs text-red-400 text-center">{errorMsg}</p>
      )}

      {/* Connections */}
      <div className="rounded-xl bg-card p-4 space-y-4">
        <p className="text-sm font-medium text-neutral-400">Verbindungen</p>

        {stravaMsg && (
          <p
            className={cn(
              "text-xs text-center py-1 rounded-lg",
              stravaMsg.includes("fehlgeschlagen")
                ? "text-red-400 bg-red-500/10"
                : "text-green-400 bg-green-500/10",
            )}
          >
            {stravaMsg}
          </p>
        )}

        {/* Strava */}
        <div className="flex items-center gap-3 rounded-lg bg-neutral-800/50 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FC4C02]/20">
            <span className="text-lg font-bold text-[#FC4C02]">S</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Strava</p>
            {stravaStatus.connected ? (
              <p className="text-xs text-neutral-500">Verbunden als {stravaStatus.athlete_name}</p>
            ) : (
              <p className="text-xs text-neutral-500">Nicht verbunden</p>
            )}
          </div>
          {stravaStatus.connected ? (
            <div className="flex gap-1.5">
              <button
                onClick={handleSyncStrava}
                disabled={stravaSyncing}
                className="rounded-lg bg-neutral-700 p-2 active:scale-[0.95]"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5 text-neutral-300", stravaSyncing && "animate-spin")}
                />
              </button>
              <button
                onClick={handleDisconnectStrava}
                disabled={stravaLoading}
                className="rounded-lg bg-neutral-700 p-2 active:scale-[0.95]"
              >
                <Unlink className="h-3.5 w-3.5 text-neutral-300" />
              </button>
            </div>
          ) : (
            <button
              onClick={connectStrava}
              disabled={stravaLoading}
              className="flex items-center gap-1.5 rounded-lg bg-[#FC4C02] px-3 py-1.5 text-xs font-semibold text-white active:scale-[0.95]"
            >
              <Link2 className="h-3 w-3" /> Verbinden
            </button>
          )}
        </div>

        {/* Garmin — synced by the local script (Garmin blocks datacenter IPs) */}
        <div className="flex items-center gap-3 rounded-lg bg-neutral-800/50 p-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
            <span className="text-lg font-bold text-blue-400">G</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Garmin Connect</p>
            {garminLastSync ? (
              <p className="text-xs text-neutral-500">
                Letzter Sync: {new Date(garminLastSync).toLocaleDateString("de-DE")}
              </p>
            ) : (
              <p className="text-xs text-neutral-500">
                Noch keine Daten · lokales Script ausführen
              </p>
            )}
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-medium",
              garminLastSync ? "bg-green-500/15 text-green-400" : "bg-neutral-700 text-neutral-400",
            )}
          >
            {garminLastSync ? "Aktiv" : "Inaktiv"}
          </span>
        </div>
      </div>

      {/* Export */}
      <button
        onClick={exportData}
        disabled={exporting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-300 transition-all active:scale-[0.98] disabled:opacity-50"
      >
        <Download className="h-4 w-4" /> {exporting ? "Exportiert..." : "Daten exportieren"}
      </button>
      {exportMsg && (
        <p role="alert" className="text-center text-xs text-red-400">
          {exportMsg}
        </p>
      )}

      <LegalLinks className="text-center text-xs text-neutral-500" />

      {/* Account */}
      <div className="rounded-xl bg-card p-4 space-y-3">
        <p className="text-xs text-neutral-400">Angemeldet als {session?.user.email ?? "Demo"}</p>
        {!IS_DEMO && (
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-300 transition-all active:scale-[0.98]"
          >
            Abmelden
          </button>
        )}
        {aiConsent && (
          <button onClick={withdrawAiConsent} className="w-full py-2 text-xs text-neutral-400">
            KI-Zustimmung zurückziehen
          </button>
        )}
        {!IS_DEMO && !deleteOpen && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="w-full py-2 text-xs text-red-400/80"
          >
            Konto löschen
          </button>
        )}
        {!IS_DEMO && deleteOpen && (
          <div className="space-y-2 rounded-lg border border-red-500/30 p-3">
            <p className="text-xs text-neutral-300">
              Löscht dein Konto und alle Daten endgültig. Das lässt sich nicht rückgängig machen.
              Vorher exportieren, falls du die Daten behalten willst. Zum Bestätigen LÖSCHEN
              eintippen.
            </p>
            <input
              value={deleteWord}
              onChange={(e) => setDeleteWord(e.target.value)}
              aria-label="Zum Bestätigen LÖSCHEN eintippen"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteWord("");
                  setDeleteError(null);
                }}
                className="flex-1 rounded-lg bg-neutral-800 py-2 text-sm text-neutral-300"
              >
                Abbrechen
              </button>
              <button
                onClick={() => void confirmDelete()}
                disabled={deleteWord !== "LÖSCHEN" || deleting}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {deleting ? "Löscht..." : "Endgültig löschen"}
              </button>
            </div>
            {deleteError && (
              <p role="alert" className="text-xs text-red-400">
                {deleteError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
