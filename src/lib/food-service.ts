// Multi-layer food lookup service
// Layer 1: Barcode → FatSecret
// Layer 2: Text search → FatSecret
// Layer 3: AI freitext → Claude Haiku

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FOOD_API = `${SUPABASE_URL}/functions/v1/food-lookup`;

export interface FatSecretServing {
  id: string;
  description: string;
  metricAmount: number;
  metricUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  vitaminA: number; // mcg
  vitaminC: number; // mg
  vitaminD: number; // mcg
  calcium: number; // mg
  iron: number; // mg
  potassium: number; // mg
  sodium: number; // mg
}

export interface FatSecretFood {
  id: string;
  name: string;
  brand: string | null;
  servings: FatSecretServing[];
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
  const res = await fetch(`${FOOD_API}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Food API error: ${res.status} ${err}`);
  }
  return res.json();
}

// Layer 1: Barcode scan
export async function lookupBarcode(barcode: string): Promise<{ found: boolean; food?: FatSecretFood }> {
  return foodFetch("barcode", { barcode });
}

// Layer 2: Text search
export async function searchFoods(query: string, page = 0): Promise<{ results: FoodSearchResult[]; totalResults: number }> {
  return foodFetch("search", { query, page });
}

// Layer 2b: Get full food details
export async function getFoodDetails(foodId: string): Promise<FatSecretFood> {
  return foodFetch("food", { food_id: foodId });
}

// Layer 3: AI freitext
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

export function addRecentFood(food: RecentFood) {
  const recents = getRecentFoods().filter((f) => f.name !== food.name);
  recents.unshift({ ...food, lastUsed: Date.now() });
  if (recents.length > MAX_RECENT) recents.length = MAX_RECENT;
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
}
