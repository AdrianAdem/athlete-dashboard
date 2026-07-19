import { useState, useEffect } from "react";
import { Save, Download, Check, AlertCircle, Link2, Unlink, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import {
  getStravaStatus,
  getStravaAuthUrl,
  disconnectStrava,
  syncStravaActivities,
} from "@/lib/strava-service";
import { getGarminData } from "@/lib/garmin-service";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function SettingsPage() {
  const [searchParams] = useSearchParams();
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
  const [proteinGoal, setProteinGoal] = useState(150);
  const [carbsGoal, setCarbsGoal] = useState(250);
  const [fatGoal, setFatGoal] = useState(80);
  const [waterGoal, setWaterGoal] = useState(3000);

  useEffect(() => {
    const loadProfile = async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", USER_ID)
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
    getStravaStatus().then(setStravaStatus);
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
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
    if (stravaParam === "connected") setStravaMsg("Strava erfolgreich verbunden!");
    else if (stravaParam === "error") setStravaMsg("Strava-Verbindung fehlgeschlagen");
  }, [searchParams]);

  const connectStrava = async () => {
    setStravaLoading(true);
    const url = await getStravaAuthUrl();
    window.location.href = url;
  };

  const handleDisconnectStrava = async () => {
    setStravaLoading(true);
    await disconnectStrava();
    setStravaStatus({ connected: false, athlete_name: null, last_updated: null });
    setStravaLoading(false);
  };

  const handleSyncStrava = async () => {
    setStravaSyncing(true);
    try {
      const result = await syncStravaActivities();
      setStravaMsg(`${result.imported} Aktivitäten synchronisiert`);
    } catch {
      setStravaMsg("Sync fehlgeschlagen");
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
        protein_goal: proteinGoal,
        carbs_goal: carbsGoal,
        fat_goal: fatGoal,
        water_goal_ml: waterGoal,
      })
      .eq("id", USER_ID);

    if (error) {
      console.error("Profile save error:", error);
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  };

  const exportData = async () => {
    const tables = [
      "daily_todos",
      "sport_todos",
      "training_plans",
      "training_exercises",
      "training_logs",
      "nutrition_log",
      "water_log",
      "weight_log",
      "weekly_reports",
    ];

    const allData: Record<string, unknown[]> = {};
    for (const table of tables) {
      const { data } = await supabase.from(table).select("*").eq("user_id", USER_ID);
      allData[table] = data ?? [];
    }

    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athlete-dashboard-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
            <Input
              type="text"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              placeholder="TT.MM.JJJJ"
              className="bg-neutral-800 border-none"
            />
          </div>
        </div>
      </div>

      {/* Daily goals */}
      <div className="rounded-xl bg-card p-4 space-y-4">
        <p className="text-sm font-medium text-neutral-400">Tagesziele</p>
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
              value={proteinGoal}
              onChange={(e) => setProteinGoal(Number(e.target.value))}
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Kohlenhydrate (g)</label>
            <Input
              type="number"
              value={carbsGoal}
              onChange={(e) => setCarbsGoal(Number(e.target.value))}
              className="bg-neutral-800 border-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Fett (g)</label>
            <Input
              type="number"
              value={fatGoal}
              onChange={(e) => setFatGoal(Number(e.target.value))}
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
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-300 transition-all active:scale-[0.98]"
      >
        <Download className="h-4 w-4" /> Daten exportieren
      </button>
    </div>
  );
}
