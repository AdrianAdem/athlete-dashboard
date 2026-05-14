import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { NutritionLog, MealType } from "@/types/database";

interface OpenFoodFactsProduct {
  product_name: string;
  code: string;
  nutriments: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
  };
}

const mealLabels: Record<MealType, string> = {
  "frühstück": "Frühstück",
  "mittagessen": "Mittagessen",
  "abendessen": "Abendessen",
  "snack": "Snack",
};

function MacroRing({ label, current, goal, color }: {
  label: string;
  current: number;
  goal: number;
  color: string;
}) {
  const pct = Math.min((current / goal) * 100, 100);
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="70" height="70" className="-rotate-90">
        <circle cx="35" cy="35" r={radius} fill="none" stroke="currentColor" className="text-muted" strokeWidth="6" />
        <circle cx="35" cy="35" r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="text-xs font-medium">{Math.round(current)}/{goal}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function NutritionPage() {
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OpenFoodFactsProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [mealType, setMealType] = useState<MealType>("frühstück");
  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [fiber, setFiber] = useState(0);
  const [barcode, setBarcode] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from("nutrition_log")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("date", todayString())
      .order("created_at", { ascending: true });
    if (data) setLogs(data as NutritionLog[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const searchFood = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10`
      );
      const json = await res.json();
      setSearchResults(
        (json.products ?? []).filter((p: OpenFoodFactsProduct) => p.product_name)
      );
    } catch {
      setSearchResults([]);
    }
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
    setCalories(Math.round(n["energy-kcal_100g"] ?? 0));
    setProtein(Math.round((n.proteins_100g ?? 0) * 10) / 10);
    setCarbs(Math.round((n.carbohydrates_100g ?? 0) * 10) / 10);
    setFat(Math.round((n.fat_100g ?? 0) * 10) / 10);
    setFiber(Math.round((n.fiber_100g ?? 0) * 10) / 10);
    setQuantity(100);
    setSearchQuery("");
    setSearchResults([]);
  };

  const addEntry = async () => {
    if (!foodName.trim()) return;
    const factor = quantity / 100;
    const { data } = await supabase
      .from("nutrition_log")
      .insert({
        user_id: USER_ID,
        date: todayString(),
        meal_type: mealType,
        food_name: foodName.trim(),
        barcode,
        calories: Math.round(calories * factor),
        protein_g: Math.round(protein * factor * 10) / 10,
        carbs_g: Math.round(carbs * factor * 10) / 10,
        fat_g: Math.round(fat * factor * 10) / 10,
        fiber_g: Math.round(fiber * factor * 10) / 10,
        quantity_g: quantity,
      })
      .select()
      .single();
    if (data) {
      setLogs((prev) => [...prev, data as NutritionLog]);
      resetForm();
      setDialogOpen(false);
    }
  };

  const deleteEntry = async (id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("nutrition_log").delete().eq("id", id);
  };

  const resetForm = () => {
    setFoodName("");
    setSearchQuery("");
    setSearchResults([]);
    setBarcode(null);
    setCalories(0);
    setProtein(0);
    setCarbs(0);
    setFat(0);
    setFiber(0);
    setQuantity(100);
  };

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein_g,
      carbs: acc.carbs + l.carbs_g,
      fat: acc.fat + l.fat_g,
      fiber: acc.fiber + l.fiber_g,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  const goals = {
    calories: 2500,
    protein: 150,
    carbs: 250,
    fat: 80,
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Laden...</div>;
  }

  const mealGroups = (["frühstück", "mittagessen", "abendessen", "snack"] as MealType[]).map(
    (mt) => ({
      type: mt,
      label: mealLabels[mt],
      items: logs.filter((l) => l.meal_type === mt),
    })
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Ernährung</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Eintrag</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Mahlzeit hinzufügen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mahlzeit</Label>
                <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(mealLabels) as [MealType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Suche (OpenFoodFacts)</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Produkt suchen..."
                    className="pl-9"
                  />
                </div>
                {searching && <p className="text-xs text-muted-foreground">Suche...</p>}
                {searchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border">
                    {searchResults.map((p, i) => (
                      <button
                        key={i}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => selectProduct(p)}
                      >
                        {p.product_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={foodName} onChange={(e) => setFoodName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Menge (g)</Label>
                <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Kalorien/100g</Label>
                  <Input type="number" value={calories} onChange={(e) => setCalories(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Protein/100g</Label>
                  <Input type="number" step="0.1" value={protein} onChange={(e) => setProtein(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kohlenhydrate/100g</Label>
                  <Input type="number" step="0.1" value={carbs} onChange={(e) => setCarbs(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fett/100g</Label>
                  <Input type="number" step="0.1" value={fat} onChange={(e) => setFat(Number(e.target.value))} />
                </div>
              </div>

              <Button onClick={addEntry} className="w-full" disabled={!foodName.trim()}>
                Hinzufügen
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Macro rings */}
      <Card>
        <CardContent className="flex justify-around p-4">
          <MacroRing label="kcal" current={totals.calories} goal={goals.calories} color="#3b82f6" />
          <MacroRing label="Protein" current={totals.protein} goal={goals.protein} color="#22c55e" />
          <MacroRing label="Carbs" current={totals.carbs} goal={goals.carbs} color="#f59e0b" />
          <MacroRing label="Fett" current={totals.fat} goal={goals.fat} color="#ef4444" />
        </CardContent>
      </Card>

      {/* Meals grouped */}
      {mealGroups.map((group) => (
        <div key={group.type}>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{group.label}</h2>
          {group.items.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">Keine Einträge</p>
          ) : (
            <div className="space-y-1">
              {group.items.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{item.food_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity_g}g · {item.calories} kcal · P {item.protein_g}g · K {item.carbs_g}g · F {item.fat_g}g
                      </p>
                    </div>
                    <button onClick={() => deleteEntry(item.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
