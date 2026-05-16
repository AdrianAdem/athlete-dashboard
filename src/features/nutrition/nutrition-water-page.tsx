import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Search, X, Droplets, Sunrise, Sun, Moon, Apple, Pill, Camera, MessageSquare, Star, Clock, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { calculateMacros } from "@/lib/macro-calc";
import { searchFoods, getFoodDetails, lookupBarcode, parseWithAI, addRecentFood, getRecentFoods } from "@/lib/food-service";
import type { FoodSearchResult, FatSecretFood, AIFoodItem, RecentFood } from "@/lib/food-service";
import type { NutritionLog, MealType, WaterLog } from "@/types/database";

function guessUnit(name: string): QuantityUnit {
  const lower = name.toLowerCase();
  const mlKeywords = ["milch", "milk", "saft", "juice", "wasser", "water", "drink", "cola", "limo", "bier", "beer", "wein", "wine", "öl", "oil", "sauce", "soße", "brühe", "smoothie", "shake", "joghurt", "yogurt", "sahne", "cream"];
  const stueckKeywords = ["riegel", "bar", "keks", "cookie", "ei ", "eier", "egg", "banane", "banana", "apfel", "apple", "brötchen", "brot", "bread", "toast", "scheibe", "slice", "stück", "piece", "donut", "muffin", "croissant", "wrap", "pizza"];
  if (mlKeywords.some((k) => lower.includes(k))) return "ml";
  if (stueckKeywords.some((k) => lower.includes(k))) return "stück";
  return "g";
}

type TabType = MealType | "water";
type QuantityUnit = "g" | "ml" | "stück";
type AddMode = "search" | "barcode" | "ai" | null;

const mealConfig: { type: MealType; label: string; icon: typeof Sunrise; pct: number }[] = [
  { type: "frühstück", label: "Frühstück", icon: Sunrise, pct: 0.25 },
  { type: "mittagessen", label: "Mittag", icon: Sun, pct: 0.35 },
  { type: "abendessen", label: "Abend", icon: Moon, pct: 0.30 },
  { type: "snack", label: "Snacks", icon: Apple, pct: 0.10 },
];

function RingProgress({ value, max, size = 64, strokeWidth = 5, color, children }: {
  value: number; max: number; size?: number; strokeWidth?: number; color: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#262626" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center">{children}</div>
    </div>
  );
}

// Barcode Scanner Component
function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstance = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!mounted || !scannerRef.current) return;
      const scanner = new Html5Qrcode("barcode-reader");
      scannerInstance.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            scanner.stop().catch(() => {});
            onScan(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error("Camera error:", err);
      }
    })();
    return () => {
      mounted = false;
      scannerInstance.current?.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Barcode scannen</p>
        <button onClick={onClose}><X className="h-4 w-4 text-neutral-500" /></button>
      </div>
      <div ref={scannerRef} id="barcode-reader" className="overflow-hidden rounded-xl" />
      <p className="text-center text-xs text-neutral-500">Halte den Barcode vor die Kamera</p>
    </div>
  );
}

// AI Freitext Component
function AIFreitext({ onResults, onClose }: { onResults: (items: AIFoodItem[]) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const items = await parseWithAI(text);
      onResults(items);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">AI Freitext</p>
        <button onClick={onClose}><X className="h-4 w-4 text-neutral-500" /></button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='z.B. "großer Teller Reis mit Hähnchen und Brokkoli"'
        className="w-full rounded-xl bg-neutral-800 p-3 text-sm text-white placeholder:text-neutral-500 outline-none resize-none"
        rows={3}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button onClick={submit} disabled={!text.trim() || loading}
        className="w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-30 active:scale-[0.98]">
        {loading ? "Analysiere..." : "Analysieren"}
      </button>
    </div>
  );
}

// Date helper — shift by N days from a YYYY-MM-DD string
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string): string {
  const today = todayString();
  if (dateStr === today) return "Heute";
  if (dateStr === shiftDate(today, -1)) return "Gestern";
  if (dateStr === shiftDate(today, 1)) return "Morgen";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
}

export function NutritionWaterPage() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("frühstück");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const isToday = selectedDate === todayString();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // AI results state
  const [aiResults, setAiResults] = useState<AIFoodItem[]>([]);

  // Food entry form state
  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>("g");
  const [baseCal, setBaseCal] = useState(0);
  const [baseProt, setBaseProt] = useState(0);
  const [baseCarbs, setBaseCarbs] = useState(0);
  const [baseFat, setBaseFat] = useState(0);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [foodSource, setFoodSource] = useState<"barcode" | "search" | "ai" | "custom">("search");

  const factor = quantityUnit === "stück" ? 1 : quantity / 100;
  const liveCal = Math.round(baseCal * factor);
  const liveProt = Math.round(baseProt * factor * 10) / 10;
  const liveCarbs = Math.round(baseCarbs * factor * 10) / 10;
  const liveFat = Math.round(baseFat * factor * 10) / 10;

  // Goals
  const [calorieGoal, setCalorieGoal] = useState(2500);
  const [waterGoalMl, setWaterGoalMl] = useState(3000);
  const [bodyWeight, setBodyWeight] = useState(80);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [nRes, wRes, profileRes] = await Promise.all([
      supabase.from("nutrition_log").select("*").eq("user_id", USER_ID).eq("date", selectedDate).order("created_at"),
      supabase.from("water_log").select("*").eq("user_id", USER_ID).eq("date", selectedDate).order("logged_at"),
      supabase.from("user_profiles").select("calorie_goal, water_goal_ml").eq("id", USER_ID).single(),
    ]);
    if (nRes.data) setLogs(nRes.data as NutritionLog[]);
    if (wRes.data) setWaterLogs(wRes.data as WaterLog[]);
    if (profileRes.data) {
      setCalorieGoal(profileRes.data.calorie_goal ?? 2500);
      setWaterGoalMl(profileRes.data.water_goal_ml ?? 3000);
    }
    const { data: wt } = await supabase.from("weight_log").select("weight_kg").eq("user_id", USER_ID)
      .order("date", { ascending: false }).limit(1).single();
    if (wt) setBodyWeight(wt.weight_kg);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goals = calculateMacros(calorieGoal, bodyWeight);

  // FatSecret search with custom_foods fallback
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (value.length < 2) { setSearchResults([]); return; }
      setSearching(true);
      try {
        const [fatSecretRes, customRes] = await Promise.all([
          searchFoods(value).catch(() => ({ results: [], totalResults: 0 })),
          supabase.from("custom_foods").select("*").eq("user_id", USER_ID)
            .ilike("name", `%${value}%`).limit(5)
            .then(({ data }) => data ?? []),
        ]);

        // Custom foods as search results
        const customResults: FoodSearchResult[] = (customRes as { name: string }[]).map((f, i) => ({
          id: `custom_${i}`,
          name: `★ ${f.name}`,
          brand: "Eigene",
          description: "",
        }));

        setSearchResults([...customResults, ...fatSecretRes.results]);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 300);
  };

  const selectSearchResult = async (result: FoodSearchResult) => {
    // Custom food
    if (result.id.startsWith("custom_")) {
      const name = result.name.replace(/^★\s*/, "");
      const { data } = await supabase.from("custom_foods").select("*").eq("user_id", USER_ID).eq("name", name).single();
      if (data) {
        setFoodName(data.name);
        setBaseCal(data.calories_100);
        setBaseProt(data.protein_100);
        setBaseCarbs(data.carbs_100);
        setBaseFat(data.fat_100);
        setFoodSource("custom");
        setQuantityUnit(guessUnit(data.name));
        setQuantity(100);
      }
      setSearchQuery("");
      setSearchResults([]);
      return;
    }

    // FatSecret food — fetch full details
    try {
      const food = await getFoodDetails(result.id);
      if (food) applyFatSecretFood(food, "search");
    } catch (err) {
      console.error("Failed to get food details:", err);
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  const applyFatSecretFood = (food: FatSecretFood, source: "barcode" | "search") => {
    setFoodName(food.brand ? `${food.name} (${food.brand})` : food.name);
    setFoodSource(source);

    // Use first serving with metric data, or fall back to first serving
    const serving = food.servings.find((s) => s.metricAmount > 0) ?? food.servings[0];
    if (serving) {
      // Normalize to per 100g/ml
      const metricAmount = serving.metricAmount || 100;
      const normFactor = 100 / metricAmount;
      setBaseCal(Math.round(serving.calories * normFactor));
      setBaseProt(Math.round(serving.protein * normFactor * 10) / 10);
      setBaseCarbs(Math.round(serving.carbs * normFactor * 10) / 10);
      setBaseFat(Math.round(serving.fat * normFactor * 10) / 10);
      setQuantityUnit(serving.metricUnit === "ml" ? "ml" : "g");
      setQuantity(Math.round(metricAmount));
    }
  };

  // Barcode scan handler
  const handleBarcodeScan = async (code: string) => {
    setAddMode("search");
    try {
      const result = await lookupBarcode(code);
      if (result.found && result.food) {
        applyFatSecretFood(result.food, "barcode");
        setBarcode(code);
      } else {
        // Barcode not found — fall back to search with the code
        setSearchQuery(code);
        handleSearchChange(code);
      }
    } catch (err) {
      console.error("Barcode lookup failed:", err);
      setSearchQuery(code);
    }
  };

  // AI results handler
  const handleAIResults = (items: AIFoodItem[]) => {
    setAiResults(items);
  };

  const addAIItem = (item: AIFoodItem) => {
    setFoodName(item.name);
    setBaseCal(Math.round((item.calories / item.amount_g) * 100));
    setBaseProt(Math.round((item.protein_g / item.amount_g) * 100 * 10) / 10);
    setBaseCarbs(Math.round((item.carbs_g / item.amount_g) * 100 * 10) / 10);
    setBaseFat(Math.round((item.fat_g / item.amount_g) * 100 * 10) / 10);
    setQuantity(item.amount_g);
    setQuantityUnit("g");
    setFoodSource("ai");
    setAiResults([]);
    setAddMode("search");
  };

  // Select recent food
  const selectRecent = (recent: RecentFood) => {
    setFoodName(recent.name);
    setBaseCal(recent.calories_100);
    setBaseProt(recent.protein_100);
    setBaseCarbs(recent.carbs_100);
    setBaseFat(recent.fat_100);
    setFoodSource(recent.source);
    setQuantityUnit("g");
    setQuantity(100);
    setAddMode("search");
  };

  const addEntry = async () => {
    if (!foodName.trim() || activeTab === "water") return;
    const { data } = await supabase
      .from("nutrition_log")
      .insert({
        user_id: USER_ID, date: selectedDate, meal_type: activeTab as MealType,
        food_name: foodName.trim(), barcode,
        calories: liveCal, protein_g: liveProt, carbs_g: liveCarbs, fat_g: liveFat,
        fiber_g: 0, quantity_g: quantity,
      })
      .select().single();
    if (data) {
      setLogs((prev) => [...prev, data as NutritionLog]);
      // Save to recent foods
      addRecentFood({
        name: foodName.trim().replace(/^★\s*/, ""),
        calories_100: baseCal, protein_100: baseProt, carbs_100: baseCarbs, fat_100: baseFat,
        source: foodSource, lastUsed: Date.now(),
      });
      resetForm();
    }
  };

  const saveCustomFood = async () => {
    if (!foodName.trim() || baseCal === 0) return;
    await supabase.from("custom_foods").upsert({
      user_id: USER_ID,
      name: foodName.trim().replace(/^★\s*/, ""),
      calories_100: baseCal, protein_100: baseProt, carbs_100: baseCarbs, fat_100: baseFat,
    }, { onConflict: "user_id,name" });
  };

  const resetForm = () => {
    setFoodName(""); setBarcode(null); setBaseCal(0); setBaseProt(0); setBaseCarbs(0); setBaseFat(0);
    setQuantity(100); setQuantityUnit("g"); setShowAddForm(false); setAddMode(null);
    setSearchQuery(""); setSearchResults([]); setAiResults([]); setFoodSource("search");
  };

  const deleteEntry = async (id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("nutrition_log").delete().eq("id", id);
  };

  const addWater = async (amount: number) => {
    const { data } = await supabase
      .from("water_log")
      .insert({ user_id: USER_ID, date: selectedDate, amount_ml: amount })
      .select().single();
    if (data) setWaterLogs((prev) => [...prev, data as WaterLog]);
  };

  const deleteWater = async (id: string) => {
    setWaterLogs((prev) => prev.filter((w) => w.id !== id));
    await supabase.from("water_log").delete().eq("id", id);
  };

  const totals = logs.reduce(
    (acc, l) => ({ calories: acc.calories + l.calories, protein: acc.protein + l.protein_g, carbs: acc.carbs + l.carbs_g, fat: acc.fat + l.fat_g }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const waterTotalMl = waterLogs.reduce((s, w) => s + w.amount_ml, 0);
  const mealTotals = (mt: MealType) => logs.filter((l) => l.meal_type === mt).reduce((a, l) => a + l.calories, 0);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;

  const remaining = goals.calories - totals.calories;

  return (
    <div className="space-y-4 p-4 pb-32">
      {/* Hero card — centered ring with Gegessen / Übrig / Wasser */}
      <div className="rounded-2xl bg-card p-5">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-bold">Ernährung</h1>
          <button onClick={() => navigate("/sport/mikro")}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-2.5 py-1.5 transition-all active:scale-95">
            <Pill className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-medium text-neutral-400">Mikro</span>
          </button>
        </div>

        {/* Date navigation — centered */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            className="rounded-lg p-1.5 transition-all active:scale-90">
            <ChevronLeft className="h-5 w-5 text-neutral-400" />
          </button>
          <button onClick={() => setSelectedDate(todayString())}
            className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-neutral-500" />
            <span className="text-sm font-medium">{formatDateLabel(selectedDate)}</span>
          </button>
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            className={`rounded-lg p-1.5 transition-all active:scale-90 ${isToday ? "opacity-30 pointer-events-none" : ""}`}>
            <ChevronRight className="h-5 w-5 text-neutral-400" />
          </button>
        </div>

        <div className="flex items-center justify-around py-3">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-neutral-500">Gegessen</span>
            <span className="text-xl font-bold">{totals.calories}</span>
          </div>

          <RingProgress value={totals.calories} max={goals.calories} size={120} strokeWidth={8}
            color={remaining >= 0 ? "#22c55e" : "#ef4444"}>
            <span className="text-[10px] text-neutral-500">Übrig</span>
            <span className={`text-2xl font-bold ${remaining < 0 ? "text-red-500" : ""}`}>
              {Math.abs(remaining)}
            </span>
            <span className="text-[9px] text-neutral-600">Ziel {goals.calories} kcal</span>
          </RingProgress>

          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-neutral-500">Wasser</span>
            <span className="text-xl font-bold">{(waterTotalMl / 1000).toFixed(1)}L</span>
          </div>
        </div>

        {/* Macro bars — 3 column */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <MacroCard label="Kohlenhydrate" current={totals.carbs} goal={goals.carbs} color="#f59e0b" />
          <MacroCard label="Protein" current={totals.protein} goal={goals.protein} color="#22c55e" />
          <MacroCard label="Fett" current={totals.fat} goal={goals.fat} color="#ef4444" />
        </div>
      </div>

      {/* Meal + Water tabs — pill style */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {mealConfig.map((meal) => {
          const mealCal = mealTotals(meal.type);
          const isActive = activeTab === meal.type;
          return (
            <button key={meal.type} onClick={() => { setActiveTab(meal.type); setShowAddForm(false); resetForm(); }}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all ${
                isActive ? "bg-white text-black" : "bg-card text-neutral-400"
              }`}>
              <meal.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
              {meal.label}
              {mealCal > 0 && <span className="text-[10px] opacity-60">{mealCal}</span>}
            </button>
          );
        })}
        <button onClick={() => { setActiveTab("water"); setShowAddForm(false); resetForm(); }}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all ${
            activeTab === "water" ? "bg-blue-500 text-white" : "bg-card text-neutral-400"
          }`}>
          <Droplets className="h-3.5 w-3.5" strokeWidth={1.5} />
          Wasser
        </button>
      </div>

      {activeTab === "water" ? (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-6">
            <RingProgress value={waterTotalMl} max={waterGoalMl} size={110} strokeWidth={8} color="#3b82f6">
              <Droplets className="h-5 w-5 text-blue-400" />
              <span className="text-lg font-bold">{waterTotalMl}ml</span>
              <span className="text-[10px] text-neutral-500">von {waterGoalMl}ml</span>
            </RingProgress>
            <div className="flex gap-2">
              {[250, 500, 750].map((ml) => (
                <button key={ml} onClick={() => addWater(ml)}
                  className="rounded-xl bg-neutral-800 px-4 py-2 text-sm font-medium transition-all active:scale-95">
                  +{ml}ml
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {waterLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-xl bg-card p-3 text-sm">
                <span>{log.amount_ml} ml</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">
                    {new Date(log.logged_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button onClick={() => deleteWater(log.id)} className="text-neutral-600 active:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Essensprotokoll header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Essensprotokoll</h2>
            <span className="text-xs text-neutral-600">
              {(() => { const m = mealConfig.find((m) => m.type === activeTab)!; const cal = mealTotals(m.type); const goal = Math.round(goals.calories * m.pct); const r = goal - cal; return r > 0 ? `${r} kcal übrig` : `${Math.abs(r)} drüber`; })()}
            </span>
          </div>

          {/* Food entries with macro badges */}
          {logs.filter((l) => l.meal_type === activeTab).map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-card p-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-800">
                <Apple className="h-5 w-5 text-neutral-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.food_name}</p>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-neutral-500">{item.quantity_g}g</span>
                  <span className="text-xs font-semibold text-orange-400">{item.calories} kcal</span>
                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">K {item.carbs_g}g</span>
                  <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">P {item.protein_g}g</span>
                  <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">F {item.fat_g}g</span>
                </div>
              </div>
              <button onClick={() => deleteEntry(item.id)} className="shrink-0 text-neutral-600 active:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* Add food section */}
          {showAddForm ? (
            <div className="rounded-xl bg-card p-4 space-y-3">
              {/* Mode selector: Search / Barcode / AI */}
              {!addMode && !foodName && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Essen hinzufügen</p>
                    <button onClick={resetForm}><X className="h-4 w-4 text-neutral-500" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setAddMode("search")}
                      className="flex flex-col items-center gap-2 rounded-xl bg-neutral-800 p-4 transition-all active:scale-95">
                      <Search className="h-6 w-6 text-blue-400" />
                      <span className="text-xs font-medium">Suche</span>
                    </button>
                    <button onClick={() => setAddMode("barcode")}
                      className="flex flex-col items-center gap-2 rounded-xl bg-neutral-800 p-4 transition-all active:scale-95">
                      <Camera className="h-6 w-6 text-green-400" />
                      <span className="text-xs font-medium">Barcode</span>
                    </button>
                    <button onClick={() => setAddMode("ai")}
                      className="flex flex-col items-center gap-2 rounded-xl bg-neutral-800 p-4 transition-all active:scale-95">
                      <MessageSquare className="h-6 w-6 text-purple-400" />
                      <span className="text-xs font-medium">AI Text</span>
                    </button>
                  </div>

                  {/* Recent foods */}
                  {(() => {
                    const recents = getRecentFoods();
                    if (recents.length === 0) return null;
                    return (
                      <div>
                        <p className="mb-2 flex items-center gap-1 text-xs text-neutral-500">
                          <Clock className="h-3 w-3" /> Zuletzt verwendet
                        </p>
                        <div className="space-y-1">
                          {recents.slice(0, 5).map((r, i) => (
                            <button key={i} onClick={() => selectRecent(r)}
                              className="flex w-full items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2 text-left transition-all active:scale-[0.98]">
                              <span className="text-sm">{r.name}</span>
                              <span className="text-xs text-neutral-500">{r.calories_100} kcal/100g</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Barcode scanner */}
              {addMode === "barcode" && !foodName && (
                <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setAddMode(null)} />
              )}

              {/* AI freitext */}
              {addMode === "ai" && !foodName && aiResults.length === 0 && (
                <AIFreitext onResults={handleAIResults} onClose={() => setAddMode(null)} />
              )}

              {/* AI results list */}
              {aiResults.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">AI-Ergebnisse</p>
                    <button onClick={() => { setAiResults([]); setAddMode(null); }}>
                      <X className="h-4 w-4 text-neutral-500" />
                    </button>
                  </div>
                  {aiResults.map((item, i) => (
                    <button key={i} onClick={() => addAIItem(item)}
                      className="flex w-full items-center justify-between rounded-xl bg-neutral-800 p-3 text-left transition-all active:scale-[0.98]">
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-neutral-500">{item.amount_g}g · {item.calories} kcal</p>
                      </div>
                      <div className="text-right text-xs text-neutral-500">
                        <p>P{item.protein_g}g</p>
                        <p>K{item.carbs_g}g · F{item.fat_g}g</p>
                      </div>
                    </button>
                  ))}
                  <p className="text-center text-[10px] text-neutral-600">Tippe ein Lebensmittel an um es hinzuzufügen</p>
                </div>
              )}

              {/* Search mode */}
              {addMode === "search" && !foodName && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Suche</p>
                    <button onClick={() => setAddMode(null)}><X className="h-4 w-4 text-neutral-500" /></button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                    <Input value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
                      placeholder="Produkt suchen..." className="bg-neutral-800 border-none pl-9" autoFocus />
                  </div>
                  {searching && <p className="text-xs text-neutral-500">Suche...</p>}
                  {searchResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-800">
                      {searchResults.map((r, i) => (
                        <button key={i} className="w-full px-3 py-2.5 text-left hover:bg-neutral-800 border-b border-neutral-800/50 last:border-0"
                          onClick={() => selectSearchResult(r)}>
                          <p className="text-sm">{r.name}</p>
                          {r.brand && <p className="text-xs text-neutral-500">{r.brand}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Food detail form (shown after selecting food) */}
              {foodName && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Details anpassen</p>
                    <button onClick={resetForm}><X className="h-4 w-4 text-neutral-500" /></button>
                  </div>
                  <Input value={foodName} onChange={(e) => setFoodName(e.target.value)}
                    placeholder="Name" className="bg-neutral-800 border-none" />
                  <div className="flex gap-2">
                    <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}
                      placeholder="Menge" className="bg-neutral-800 border-none flex-1" />
                    <div className="flex gap-1">
                      {(["g", "ml", "stück"] as QuantityUnit[]).map((u) => (
                        <button key={u} onClick={() => setQuantityUnit(u)}
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${
                            quantityUnit === u ? "bg-white text-black" : "bg-neutral-800 text-neutral-400"
                          }`}>
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500">kcal/100{quantityUnit === "stück" ? "St" : quantityUnit}</label>
                      <Input type="number" value={baseCal || ""} onChange={(e) => setBaseCal(Number(e.target.value))} className="bg-neutral-800 border-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500">Protein</label>
                      <Input type="number" step="0.1" value={baseProt || ""} onChange={(e) => setBaseProt(Number(e.target.value))} className="bg-neutral-800 border-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500">Carbs</label>
                      <Input type="number" step="0.1" value={baseCarbs || ""} onChange={(e) => setBaseCarbs(Number(e.target.value))} className="bg-neutral-800 border-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-500">Fett</label>
                      <Input type="number" step="0.1" value={baseFat || ""} onChange={(e) => setBaseFat(Number(e.target.value))} className="bg-neutral-800 border-none" />
                    </div>
                  </div>
                  {baseCal > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-neutral-800/60 px-3 py-2 text-xs">
                      <span className="text-neutral-400">{quantity}{quantityUnit === "stück" ? " St" : quantityUnit} =</span>
                      <span className="font-medium text-orange-400">{liveCal} kcal</span>
                      <span className="text-green-400">P {liveProt}g</span>
                      <span className="text-amber-400">K {liveCarbs}g</span>
                      <span className="text-red-400">F {liveFat}g</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={addEntry} disabled={!foodName.trim()}
                      className="flex-1 rounded-xl bg-white py-2.5 text-sm font-semibold text-black disabled:opacity-30 active:scale-[0.98]">
                      Hinzufügen
                    </button>
                    <button onClick={saveCustomFood} disabled={!foodName.trim() || baseCal === 0}
                      className="rounded-xl bg-neutral-800 px-4 py-2.5 text-xs font-medium text-neutral-400 disabled:opacity-30 active:scale-[0.98]">
                      <Star className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button onClick={() => setShowAddForm(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-card p-3 text-sm text-neutral-400 active:scale-[0.98]">
              <Plus className="h-4 w-4" /> Essen hinzufügen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MacroCard({ label, current, goal, color }: {
  label: string; current: number; goal: number; color: string;
}) {
  const pct = Math.min((current / goal) * 100, 100);
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] text-neutral-500">{label}</span>
      <p className="text-xs font-semibold">{Math.round(current)}<span className="text-neutral-600">/{goal}g</span></p>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
