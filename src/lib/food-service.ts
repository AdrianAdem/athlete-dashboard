// Food lookup service. All calls go through the food-lookup edge function:
//   barcode / search / details → Open Food Facts
//   freetext                   → Claude Haiku estimates

import { IS_DEMO, demoFoodResponse } from "./demo-client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FOOD_API = `${SUPABASE_URL}/functions/v1/food-lookup`;

/** One serving of a product. Nutrient values are for `metricAmount` grams. */
export interface FoodServing {
  id: string;
  description: string;
  metricAmount: number;
  metricUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  vitaminA: number; // µg
  vitaminC: number; // mg
  vitaminD: number; // µg
  calcium: number; // mg
  iron: number; // mg
  potassium: number; // mg
  sodium: number; // mg
}

export interface FoodProduct {
  id: string;
  name: string;
  brand: string | null;
  servings: FoodServing[];
}

export interface FoodSearchResult {
  id: string;
  name: string;
  brand: string | null;
  description: string;
}

export interface AIFoodItem {
  name: string;
  amount_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

async function foodFetch(endpoint: string, body: Record<string, unknown>) {
  // Demo mode has no edge functions behind it; the fixture module answers
  // lookups instead. It is aliased away entirely in normal builds.
  if (IS_DEMO) return demoFoodResponse(endpoint, body);

  const res = await fetch(`${FOOD_API}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Lebensmittel-Suche fehlgeschlagen (${res.status})`);
  return data;
}

export async function lookupBarcode(barcode: string): Promise<FoodProduct | null> {
  const data = await foodFetch("barcode", { barcode });
  return data.found ? (data.food as FoodProduct) : null;
}

export async function searchFoods(
  query: string,
  page = 0,
): Promise<{ results: FoodSearchResult[]; totalResults: number }> {
  return foodFetch("search", { query, page });
}

// The endpoint answers { found, food }. Returning that wrapper as if it were
// the product made every search-result selection crash on `food.servings`.
export async function getFoodDetails(foodId: string): Promise<FoodProduct | null> {
  const data = await foodFetch("food", { food_id: foodId });
  return data.found ? (data.food as FoodProduct) : null;
}

export async function parseWithAI(text: string): Promise<AIFoodItem[]> {
  return foodFetch("ai", { text });
}

// Local cache for recent foods
const RECENT_KEY = "food_recent";
const MAX_RECENT = 20;

export interface RecentFood {
  name: string;
  calories_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  // Added later; older cached entries lack them, so they stay optional.
  fiber_100?: number;
  micros_100?: Record<string, number>;
  unit?: "g" | "ml";
  source: "barcode" | "search" | "ai" | "custom";
  lastUsed: number;
}

export function getRecentFoods(): RecentFood[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addRecentFood(food: Omit<RecentFood, "lastUsed">) {
  const recents = getRecentFoods().filter((f) => f.name !== food.name);
  recents.unshift({ ...food, lastUsed: Date.now() });
  if (recents.length > MAX_RECENT) recents.length = MAX_RECENT;
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
}
