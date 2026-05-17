import { useState, useEffect, useCallback } from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
import type { NutritionLog } from "@/types/database";

interface MicroField {
  key: string;
  label: string;
  unit: string;
  rda: number;
  color: string;
  // Which nutrition_log field to sum, if available
  sourceField?: keyof NutritionLog;
}

const microFields: MicroField[] = [
  { key: "fiber_g", label: "Ballaststoffe", unit: "g", rda: 30, color: "#a3e635", sourceField: "fiber_g" },
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

export function MicronutrientsPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [foodCount, setFoodCount] = useState(0);

  const fetchData = useCallback(async () => {
    // Fetch today's nutrition_log entries to auto-compute available micros
    const { data: logs } = await supabase
      .from("nutrition_log")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("date", todayString());

    const entries = (logs ?? []) as NutritionLog[];
    setFoodCount(entries.length);

    // Sum available fields from nutrition_log
    const sums: Record<string, number> = {};
    for (const field of microFields) {
      if (field.sourceField) {
        sums[field.key] = entries.reduce(
          (sum, entry) => sum + (Number(entry[field.sourceField!]) || 0), 0
        );
      } else {
        sums[field.key] = 0;
      }
    }
    setValues(sums);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/sport/ernaehrung")}
          className="rounded-full bg-neutral-800 p-2">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">Mikronährstoffe</h1>
      </div>

      <p className="text-xs text-neutral-500">
        Automatisch berechnet aus {foodCount} Einträgen heute. Balken zeigt % der empfohlenen Tagesdosis (RDA).
      </p>

      <div className="space-y-2">
        {microFields.map((field) => {
          const value = values[field.key] ?? 0;
          const pct = Math.min((value / field.rda) * 100, 100);
          const hasData = !!field.sourceField;
          return (
            <div key={field.key} className={`rounded-xl bg-card p-3 ${!hasData ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{field.label}</span>
                <span className="text-xs text-neutral-500">
                  {hasData ? `${value.toFixed(1)} / ${field.rda} ${field.unit}` : `— / ${field.rda} ${field.unit}`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: field.color }} />
              </div>
              {!hasData && (
                <p className="mt-1 text-[10px] text-neutral-600">Nicht in Food-Daten verfügbar</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
