import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Search, X, Droplets, Sunrise, Sun, Moon, Apple, Pill } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { calculateMacros } from "@/lib/macro-calc";
import type { NutritionLog, MealType, WaterLog } from "@/types/database";

interface OpenFoodFactsProduct {
  product_name: string;
  code: string;
  quantity?: string;
  nutriments: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    "fiber_100g"?: number;
  };
}

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

export function NutritionWaterPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [waterLogs, setWaterLogs] = useState<WaterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("frühstück");
  const [showAddForm, setShowAddForm] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OpenFoodFactsProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>("g");
  const [baseCal, setBaseCal] = useState(0);
  const [baseProt, setBaseProt] = useState(0);
  const [baseCarbs, setBaseCarbs] = useState(0);
  const [baseFat, setBaseFat] = useState(0);
  const [barcode, setBarcode] = useState<string | null>(null);

  const factor = quantityUnit === "stück" ? 1 : quantity / 100;
  const liveCal = Math.round(baseCal * factor);
  const liveProt = Math.round(baseProt * factor * 10) / 10;
  const liveCarbs = Math.round(baseCarbs * factor * 10) / 10;
  const liveFat = Math.round(baseFat * factor * 10) / 10;

  // Load goals from user profile
  const [calorieGoal, setCalorieGoal] = useState(2500);
  const [waterGoalMl, setWaterGoalMl] = useState(3000);
  const [bodyWeight, setBodyWeight] = useState(80);

  const fetchData = useCallback(async () => {
    const today = todayString();
    const [nRes, wRes, profileRes] = await Promise.all([
      supabase.from("nutrition_log").select("*").eq("user_id", USER_ID).eq("date", today).order("created_at"),
      supabase.from("water_log").select("*").eq("user_id", USER_ID).eq("date", today).order("logged_at"),
      supabase.from("user_profiles").select("calorie_goal, water_goal_ml").eq("id", USER_ID).single(),
    ]);
    if (nRes.data) setLogs(nRes.data as NutritionLog[]);
    if (wRes.data) setWaterLogs(wRes.data as WaterLog[]);
    if (profileRes.data) {
      setCalorieGoal(profileRes.data.calorie_goal ?? 2500);
      setWaterGoalMl(profileRes.data.water_goal_ml ?? 3000);
    }
    // Get latest weight for macro calc
    const { data: wt } = await supabase.from("weight_log").select("weight_kg").eq("user_id", USER_ID)
      .order("date", { ascending: false }).limit(1).single();
    if (wt) setBodyWeight(wt.weight_kg);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const goals = calculateMacros(calorieGoal, bodyWeight);

  const searchFood = useCallback(async (query: string) => {
    if (query.length < 3) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const [offRes, customRes] = await Promise.all([
        fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8`)
          .then((r) => r.json()).catch(() => ({ products: [] })),
        supabase.from("custom_foods").select("*").eq("user_id", USER_ID)
          .ilike("name", `%${query}%`).limit(5)
          .then(({ data }) => data ?? []),
      ]);

      const offProducts = (offRes.products ?? []).filter((p: OpenFoodFactsProduct) => p.product_name);
      const customProducts: OpenFoodFactsProduct[] = (customRes as { name: string; calories_100: number; protein_100: number; carbs_100: number; fat_100: number }[]).map((f) => ({
        product_name: `★ ${f.name}`,
        code: "",
        nutriments: {
          "energy-kcal_100g": f.calories_100,
          proteins_100g: f.protein_100,
          carbohydrates_100g: f.carbs_100,
          fat_100g: f.fat_100,
        },
      }));
      setSearchResults([...customProducts, ...offProducts]);
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchFood(value), 400);
  };

  const selectProduct = (product: OpenFoodFactsProduct) => {
    const n = product.nutriments;
    setFoodName(product.product_name);
    setBarcode(product.code);
    setBaseCal(Math.round(n["energy-kcal_100g"] ?? 0));
    setBaseProt(Math.round((n.proteins_100g ?? 0) * 10) / 10);
    setBaseCarbs(Math.round((n.carbohydrates_100g ?? 0) * 10) / 10);
    setBaseFat(Math.round((n.fat_100g ?? 0) * 10) / 10);
    const unit = guessUnit(product.product_name);
    setQuantityUnit(unit);
    setQuantity(unit === "stück" ? 1 : 100);
    setSearchQuery("");
    setSearchResults([]);
  };

  const addEntry = async () => {
    if (!foodName.trim() || activeTab === "water") return;
    const { data } = await supabase
      .from("nutrition_log")
      .insert({
        user_id: USER_ID, date: todayString(), meal_type: activeTab as MealType,
        food_name: foodName.trim(), barcode,
        calories: liveCal, protein_g: liveProt, carbs_g: liveCarbs, fat_g: liveFat,
        fiber_g: 0, quantity_g: quantity,
      })
      .select().single();
    if (data) {
      setLogs((prev) => [...prev, data as NutritionLog]);
      resetForm();
    }
  };

  const saveCustomFood = async () => {
    if (!foodName.trim() || baseCal === 0) return;
    await supabase.from("custom_foods").upsert({
      user_id: USER_ID,
      name: foodName.trim().replace(/^★\s*/, ""),
      calories_100: baseCal,
      protein_100: baseProt,
      carbs_100: baseCarbs,
      fat_100: baseFat,
    }, { onConflict: "user_id,name" });
  };

  const resetForm = () => {
    setFoodName(""); setBarcode(null); setBaseCal(0); setBaseProt(0); setBaseCarbs(0); setBaseFat(0);
    setQuantity(100); setQuantityUnit("g"); setShowAddForm(false); setSearchQuery(""); setSearchResults([]);
  };

  const deleteEntry = async (id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("nutrition_log").delete().eq("id", id);
  };

  const addWater = async (amount: number) => {
    const { data } = await supabase
      .from("water_log")
      .insert({ user_id: USER_ID, date: todayString(), amount_ml: amount })
      .select().single();
    if (data) setWaterLogs((prev) => [...prev, data as WaterLog]);
  };

  const totals = logs.reduce(
    (acc, l) => ({ calories: acc.calories + l.calories, protein: acc.protein + l.protein_g, carbs: acc.carbs + l.carbs_g, fat: acc.fat + l.fat_g }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const waterTotalMl = waterLogs.reduce((s, w) => s + w.amount_ml, 0);

  const mealTotals = (mt: MealType) => logs.filter((l) => l.meal_type === mt).reduce((a, l) => a + l.calories, 0);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;

  return (
    <div className="space-y-4 p-4 pb-24">
      <h1 className="text-2xl font-bold">Ernährung</h1>

      {/* Total overview ring */}
      <div className="rounded-xl bg-card p-4">
        <div className="flex items-center justify-around">
          <RingProgress value={totals.calories} max={goals.calories} size={80} color="#f97316">
            <span className="text-xs font-bold">{totals.calories}</span>
            <span className="text-[9px] text-neutral-500">/{goals.calories}</span>
          </RingProgress>
          <div className="flex flex-col gap-2">
            <MacroBar label="Protein" current={totals.protein} goal={goals.protein} color="#22c55e" />
            <MacroBar label="Carbs" current={totals.carbs} goal={goals.carbs} color="#f59e0b" />
            <MacroBar label="Fett" current={totals.fat} goal={goals.fat} color="#ef4444" />
          </div>
          <button onClick={() => navigate("/sport/mikro")}
            className="flex flex-col items-center gap-1 rounded-xl bg-neutral-800 p-2.5 transition-all active:scale-95">
            <Pill className="h-4 w-4 text-emerald-400" />
            <span className="text-[9px] font-medium text-neutral-400">Mikro</span>
          </button>
        </div>
      </div>

      {/* Meal + Water buttons — icons instead of emojis */}
      <div className="grid grid-cols-5 gap-2">
        {mealConfig.map((meal) => {
          const Icon = meal.icon;
          const mealCal = mealTotals(meal.type);
          const mealGoal = Math.round(goals.calories * meal.pct);
          const isActive = activeTab === meal.type;
          return (
            <button key={meal.type} onClick={() => { setActiveTab(meal.type); setShowAddForm(false); }}
              className={`flex flex-col items-center gap-1 rounded-xl p-3 transition-all ${
                isActive ? "bg-white text-black" : "bg-card text-neutral-400"
              }`}>
              <Icon className="h-5 w-5" strokeWidth={1.5} />
              <span className="text-[10px] font-medium">{meal.label}</span>
              <span className={`text-[10px] ${mealCal >= mealGoal ? "text-orange-500" : isActive ? "text-neutral-600" : "text-neutral-600"}`}>
                {mealCal}/{mealGoal}
              </span>
            </button>
          );
        })}
        <button onClick={() => { setActiveTab("water"); setShowAddForm(false); }}
          className={`flex flex-col items-center gap-1 rounded-xl p-3 transition-all ${
            activeTab === "water" ? "bg-blue-500 text-white" : "bg-card text-neutral-400"
          }`}>
          <Droplets className="h-5 w-5" strokeWidth={1.5} />
          <span className="text-[10px] font-medium">Wasser</span>
          <span className="text-[10px]">{(waterTotalMl / 1000).toFixed(1)}L</span>
        </button>
      </div>

      {activeTab === "water" ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 rounded-xl bg-card p-6">
            <RingProgress value={waterTotalMl} max={waterGoalMl} size={120} strokeWidth={8} color="#3b82f6">
              <Droplets className="h-5 w-5 text-blue-400" />
              <span className="text-lg font-bold">{(waterTotalMl / 1000).toFixed(1)}L</span>
              <span className="text-[10px] text-neutral-500">von {(waterGoalMl / 1000).toFixed(1)}L</span>
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
          <div className="space-y-1">
            {waterLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-xl bg-card p-3 text-sm">
                <span>{log.amount_ml} ml</span>
                <span className="text-xs text-neutral-500">
                  {new Date(log.logged_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Meal calorie budget */}
          {(() => {
            const meal = mealConfig.find((m) => m.type === activeTab)!;
            const mealCal = mealTotals(meal.type);
            const mealGoal = Math.round(goals.calories * meal.pct);
            const remaining = mealGoal - mealCal;
            const Icon = meal.icon;
            return (
              <div className="rounded-xl bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" strokeWidth={1.5} /> {meal.label}
                  </span>
                  <span className={`text-sm font-bold ${remaining < 0 ? "text-red-500" : "text-green-500"}`}>
                    {remaining > 0 ? `${remaining} kcal übrig` : `${Math.abs(remaining)} kcal drüber`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${remaining < 0 ? "bg-red-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min((mealCal / mealGoal) * 100, 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-neutral-600">{mealCal} / {mealGoal} kcal ({Math.round(meal.pct * 100)}% Tagesziel)</p>
              </div>
            );
          })()}

          {/* Food entries */}
          {logs.filter((l) => l.meal_type === activeTab).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl bg-card p-3">
              <div>
                <p className="text-sm font-medium">{item.food_name}</p>
                <p className="text-xs text-neutral-500">
                  {item.quantity_g}g · {item.calories} kcal · P{item.protein_g} · K{item.carbs_g} · F{item.fat_g}
                </p>
              </div>
              <button onClick={() => deleteEntry(item.id)} className="text-neutral-600 hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* Add food form */}
          {showAddForm ? (
            <div className="rounded-xl bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Hinzufügen</p>
                <button onClick={resetForm}><X className="h-4 w-4 text-neutral-500" /></button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-500" />
                <Input value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Produkt suchen..." className="bg-neutral-800 border-none pl-9" />
              </div>
              {searching && <p className="text-xs text-neutral-500">Suche...</p>}
              {searchResults.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-neutral-800">
                  {searchResults.map((p, i) => (
                    <button key={i} className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-800" onClick={() => selectProduct(p)}>
                      {p.product_name}
                    </button>
                  ))}
                </div>
              )}
              <Input value={foodName} onChange={(e) => setFoodName(e.target.value)}
                placeholder="Name" className="bg-neutral-800 border-none" />
              {/* Quantity + Unit */}
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
              {/* Live macro preview */}
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
                  Merken
                </button>
              </div>
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

function MacroBar({ label, current, goal, color }: {
  label: string; current: number; goal: number; color: string;
}) {
  const pct = Math.min((current / goal) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[10px] text-neutral-500">{label}</span>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] text-neutral-500">{Math.round(current)}/{goal}g</span>
    </div>
  );
}
