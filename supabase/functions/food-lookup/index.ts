// Food Lookup Edge Function
// Endpoints: /barcode, /search, /food, /ai

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// FatSecret OAuth 2.0 token cache
let tokenCache: { token: string; expires: number } | null = null;

async function getFatSecretToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expires) return tokenCache.token;

  const clientId = Deno.env.get("FATSECRET_CLIENT_ID") ?? Deno.env.get("FATSECRET_CONSUMER_KEY") ?? "";
  const clientSecret = Deno.env.get("FATSECRET_CLIENT_SECRET") ?? Deno.env.get("FATSECRET_CONSUMER_SECRET") ?? "";

  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: "grant_type=client_credentials&scope=basic",
  });

  if (!res.ok) throw new Error(`FatSecret auth failed: ${res.status}`);
  const data = await res.json();
  tokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return tokenCache.token;
}

async function fatSecretAPI(method: string, params: Record<string, string> = {}) {
  const token = await getFatSecretToken();
  const searchParams = new URLSearchParams({ method, format: "json", ...params });
  const res = await fetch(`https://platform.fatsecret.com/rest/server.api?${searchParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`FatSecret API error: ${res.status}`);
  return res.json();
}

function parseServing(s: any) {
  return {
    id: s.serving_id,
    description: s.serving_description ?? "",
    metricAmount: parseFloat(s.metric_serving_amount ?? "0"),
    metricUnit: s.metric_serving_unit ?? "g",
    calories: parseFloat(s.calories ?? "0"),
    protein: parseFloat(s.protein ?? "0"),
    carbs: parseFloat(s.carbohydrate ?? "0"),
    fat: parseFloat(s.fat ?? "0"),
    fiber: parseFloat(s.fiber ?? "0"),
  };
}

// Barcode lookup via FatSecret
async function handleBarcode(barcode: string) {
  try {
    const data = await fatSecretAPI("food.find_id_for_barcode", { barcode });
    const foodId = data?.food_id?.value;
    if (!foodId) return { found: false };
    return await handleFood(foodId);
  } catch {
    return { found: false };
  }
}

// Text search
async function handleSearch(query: string, page = 0) {
  const data = await fatSecretAPI("foods.search", {
    search_expression: query,
    page_number: String(page),
    max_results: "20",
  });
  const foods = data?.foods?.food;
  if (!foods) return { results: [], totalResults: 0 };
  const arr = Array.isArray(foods) ? foods : [foods];
  return {
    results: arr.map((f: any) => ({
      id: f.food_id,
      name: f.food_name,
      brand: f.brand_name ?? null,
      description: f.food_description ?? "",
    })),
    totalResults: parseInt(data.foods.total_results ?? "0"),
  };
}

// Get food details
async function handleFood(foodId: string) {
  const data = await fatSecretAPI("food.get.v4", { food_id: foodId });
  const food = data?.food;
  if (!food) return { found: false };

  const servingsRaw = food.servings?.serving;
  const servings = servingsRaw
    ? (Array.isArray(servingsRaw) ? servingsRaw : [servingsRaw]).map(parseServing)
    : [];

  return {
    found: true,
    food: {
      id: food.food_id,
      name: food.food_name,
      brand: food.brand_name ?? null,
      servings,
    },
  };
}

// AI parse via Claude Haiku
async function handleAI(text: string) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-20250414",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Parse this food description into individual items with nutritional estimates per item.
Return ONLY a JSON array, no markdown, no explanation.
Each item: { "name": string, "amount_g": number, "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }

Food description: "${text}"`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const content = data.content?.[0]?.text ?? "[]";
  // Extract JSON array from response
  const match = content.match(/\[[\s\S]*\]/);
  return match ? JSON.parse(match[0]) : [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();
    const body = await req.json();

    let result;
    switch (path) {
      case "barcode":
        result = await handleBarcode(body.barcode);
        break;
      case "search":
        result = await handleSearch(body.query, body.page ?? 0);
        break;
      case "food":
        result = await handleFood(body.food_id);
        break;
      case "ai":
        result = await handleAI(body.text);
        break;
      default:
        return new Response(JSON.stringify({ error: "Unknown endpoint" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
