import { useState, useEffect } from "react";
import { Save, Download, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { Input } from "@/components/ui/input";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function SettingsPage() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

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

  const saveProfile = async () => {
    setStatus("saving");
    setErrorMsg("");

    const { error } = await supabase.from("user_profiles").update({
      name: name.trim(),
      height_cm: heightCm || null,
      birth_date: birthDate || null,
      calorie_goal: calorieGoal,
      protein_goal: proteinGoal,
      carbs_goal: carbsGoal,
      fat_goal: fatGoal,
      water_goal_ml: waterGoal,
    }).eq("id", USER_ID);

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
      "daily_todos", "sport_todos", "training_plans", "training_exercises",
      "training_logs", "nutrition_log", "water_log", "weight_log", "weekly_reports",
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
    a.download = `life-manager-export-${new Date().toISOString().split("T")[0]}.json`;
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
          <Input value={name} onChange={(e) => setName(e.target.value)}
            className="bg-neutral-800 border-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Größe (cm)</label>
            <Input type="number" value={heightCm || ""} onChange={(e) => setHeightCm(Number(e.target.value))}
              className="bg-neutral-800 border-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Geburtsdatum</label>
            <Input type="text" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
              placeholder="TT.MM.JJJJ" className="bg-neutral-800 border-none" />
          </div>
        </div>
      </div>

      {/* Daily goals */}
      <div className="rounded-xl bg-card p-4 space-y-4">
        <p className="text-sm font-medium text-neutral-400">Tagesziele</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Kalorien (kcal)</label>
            <Input type="number" value={calorieGoal} onChange={(e) => setCalorieGoal(Number(e.target.value))}
              className="bg-neutral-800 border-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Protein (g)</label>
            <Input type="number" value={proteinGoal} onChange={(e) => setProteinGoal(Number(e.target.value))}
              className="bg-neutral-800 border-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Kohlenhydrate (g)</label>
            <Input type="number" value={carbsGoal} onChange={(e) => setCarbsGoal(Number(e.target.value))}
              className="bg-neutral-800 border-none" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Fett (g)</label>
            <Input type="number" value={fatGoal} onChange={(e) => setFatGoal(Number(e.target.value))}
              className="bg-neutral-800 border-none" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-neutral-500">Wasser (ml)</label>
          <Input type="number" value={waterGoal} onChange={(e) => setWaterGoal(Number(e.target.value))}
            className="bg-neutral-800 border-none" />
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
        {status === "saving" ? "Speichern..." : status === "saved" ? "Gespeichert!" : status === "error" ? "Fehler!" : "Profil speichern"}
      </button>

      {status === "error" && errorMsg && (
        <p className="text-xs text-red-400 text-center">{errorMsg}</p>
      )}

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
