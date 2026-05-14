import { useState, useEffect, useCallback } from "react";
import { Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { MicronutrientLog } from "@/types/database";

interface MicroField {
  key: keyof Omit<MicronutrientLog, "id" | "user_id" | "date" | "notes" | "created_at">;
  label: string;
  unit: string;
  rda: number;
  color: string;
}

const microFields: MicroField[] = [
  { key: "fiber_g", label: "Ballaststoffe", unit: "g", rda: 30, color: "#a3e635" },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", rda: 90, color: "#fb923c" },
  { key: "vitamin_d_mcg", label: "Vitamin D", unit: "µg", rda: 20, color: "#facc15" },
  { key: "vitamin_b12_mcg", label: "Vitamin B12", unit: "µg", rda: 2.4, color: "#f87171" },
  { key: "vitamin_a_mcg", label: "Vitamin A", unit: "µg", rda: 900, color: "#c084fc" },
  { key: "vitamin_e_mg", label: "Vitamin E", unit: "mg", rda: 15, color: "#34d399" },
  { key: "vitamin_k_mcg", label: "Vitamin K", unit: "µg", rda: 120, color: "#4ade80" },
  { key: "iron_mg", label: "Eisen", unit: "mg", rda: 8, color: "#ef4444" },
  { key: "calcium_mg", label: "Kalzium", unit: "mg", rda: 1000, color: "#e2e8f0" },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", rda: 400, color: "#06b6d4" },
  { key: "zinc_mg", label: "Zink", unit: "mg", rda: 11, color: "#a78bfa" },
  { key: "potassium_mg", label: "Kalium", unit: "mg", rda: 2600, color: "#f97316" },
  { key: "sodium_mg", label: "Natrium", unit: "mg", rda: 2300, color: "#94a3b8" },
  { key: "omega3_mg", label: "Omega-3", unit: "mg", rda: 1600, color: "#38bdf8" },
];

const emptyLog = (): Omit<MicronutrientLog, "id" | "user_id" | "date" | "created_at"> => ({
  vitamin_a_mcg: 0, vitamin_c_mg: 0, vitamin_d_mcg: 0, vitamin_e_mg: 0,
  vitamin_k_mcg: 0, vitamin_b12_mcg: 0, iron_mg: 0, calcium_mg: 0,
  magnesium_mg: 0, zinc_mg: 0, potassium_mg: 0, sodium_mg: 0,
  fiber_g: 0, omega3_mg: 0, notes: null,
});

export function MicronutrientsPage() {
  const [data, setData] = useState(emptyLog());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchData = useCallback(async () => {
    const { data: log } = await supabase
      .from("micronutrient_log")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("date", todayString())
      .single();
    if (log) {
      const { id, user_id, date, created_at, ...rest } = log as MicronutrientLog;
      void id; void user_id; void date; void created_at;
      setData(rest);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const save = async () => {
    setSaving(true);
    await supabase.from("micronutrient_log").upsert({
      user_id: USER_ID,
      date: todayString(),
      ...data,
    }, { onConflict: "user_id,date" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateField = (key: string, value: number) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mikronährstoffe</h1>
        <button onClick={save} disabled={saving}
          className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-all active:scale-[0.97] ${
            saved ? "bg-green-600 text-white" : "bg-neutral-800 text-neutral-300"
          }`}>
          <Save className="h-3 w-3" />
          {saving ? "..." : saved ? "Gespeichert" : "Speichern"}
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        Tägliche Mikronährstoff-Aufnahme. Balken zeigt % der empfohlenen Tagesdosis (RDA).
      </p>

      <div className="space-y-2">
        {microFields.map((field) => {
          const value = (data[field.key] as number) ?? 0;
          const pct = Math.min((value / field.rda) * 100, 100);
          return (
            <div key={field.key} className="rounded-xl bg-card p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{field.label}</span>
                    <span className="text-xs text-neutral-500">
                      {value} / {field.rda} {field.unit}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: field.color }} />
                  </div>
                </div>
                <Input type="number" step="any" value={value || ""}
                  onChange={(e) => updateField(field.key, Number(e.target.value))}
                  className="w-20 bg-neutral-800 border-none text-right text-sm" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes */}
      <div className="rounded-xl bg-card p-4 space-y-2">
        <p className="text-sm font-medium">Notizen</p>
        <textarea
          value={data.notes ?? ""}
          onChange={(e) => setData((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="z.B. Vitamin D Supplement genommen..."
          className="w-full rounded-lg bg-neutral-800 p-3 text-sm text-white placeholder:text-neutral-600 resize-none"
          rows={2}
        />
      </div>
    </div>
  );
}
