// Fixture data for demo mode (VITE_DEMO=1).
//
// Everything is generated relative to today so the app always looks "current"
// without a backend. The GPS track is a synthetic loop through a public park,
// not a real recorded route.

import { USER_ID } from "./constants";

const DAY = 86_400_000;

/** YYYY-MM-DD, `daysAgo` days before today. */
function day(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
}

function iso(daysAgo: number, hour = 12, minute = 0): string {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Weekday index with Monday = 0, matching the routines schedule format. */
function weekdayIndex(daysAgo: number): number {
  const js = new Date(Date.now() - daysAgo * DAY).getDay();
  return js === 0 ? 6 : js - 1;
}

const uid = (prefix: string, n: number) => `demo-${prefix}-${n}`;

// ── Routines ────────────────────────────────────────────────────────

const routineDefs = [
  {
    name: "Morgenroutine",
    category: "morgenroutine",
    items: ["Wasser trinken", "5 Min Mobility", "Kaltdusche", "Tagesplanung"],
  },
  {
    name: "Scapula & Prehab",
    category: "mobility",
    items: ["Band Pull-Aparts", "Face Pulls", "Wall Slides", "Y-T-W Raises"],
  },
  {
    name: "Core Routine",
    category: "kraft",
    items: ["Plank 60s", "Side Plank 2x30s", "Dead Bug", "Hollow Hold"],
  },
  { name: "Abendroutine", category: "abendroutine", items: ["Handy weglegen", "Dehnen", "Lesen"] },
] as const;

export const demoRoutines = routineDefs.map((r, i) => ({
  id: uid("routine", i),
  user_id: USER_ID,
  name: r.name,
  description: null,
  area: "sport",
  category: r.category,
  weekdays: null,
  start_date: null,
  end_date: null,
  is_active: true,
  created_at: iso(60),
}));

export const demoRoutineItems = routineDefs.flatMap((r, ri) =>
  r.items.map((name, ii) => ({
    id: uid(`item-${ri}`, ii),
    routine_id: uid("routine", ri),
    name,
    sets: null,
    reps: null,
    duration_sec: null,
    notes: null,
    order_index: ii,
  })),
);

// Today: first routine fully done, second partially — gives the dashboard a
// non-trivial progress state.
export const demoRoutineLogs = [
  {
    id: uid("rlog", 0),
    routine_id: uid("routine", 0),
    user_id: USER_ID,
    date: day(0),
    completed_items: routineDefs[0].items.map((_, ii) => uid("item-0", ii)),
    completed: true,
    created_at: iso(0, 7),
  },
  {
    id: uid("rlog", 1),
    routine_id: uid("routine", 1),
    user_id: USER_ID,
    date: day(0),
    completed_items: [uid("item-1", 0), uid("item-1", 1)],
    completed: false,
    created_at: iso(0, 9),
  },
];

// ── Strength training ───────────────────────────────────────────────

export const demoTrainingPlans = [
  {
    id: uid("plan", 0),
    user_id: USER_ID,
    name: "Push / Pull / Legs",
    description: "3er-Split, 5x pro Woche",
    is_active: true,
    created_at: iso(90),
  },
];

const exerciseDefs = [
  { name: "Bankdrücken", muscle: "Brust", day: "Push", sets: 4, reps: 8, base: 72.5 },
  { name: "Schrägbankdrücken KH", muscle: "Brust", day: "Push", sets: 3, reps: 10, base: 28 },
  { name: "Klimmzüge", muscle: "Rücken", day: "Pull", sets: 4, reps: 8, base: 10 },
  { name: "Langhantelrudern", muscle: "Rücken", day: "Pull", sets: 4, reps: 10, base: 65 },
  { name: "Kniebeuge", muscle: "Beine", day: "Legs", sets: 5, reps: 5, base: 95 },
  { name: "Rumänisches Kreuzheben", muscle: "Beine", day: "Legs", sets: 3, reps: 10, base: 85 },
];

export const demoTrainingExercises = exerciseDefs.map((e, i) => ({
  id: uid("ex", i),
  plan_id: uid("plan", 0),
  name: e.name,
  muscle_group: e.muscle,
  sets: e.sets,
  reps: e.reps,
  day_label: e.day,
  order_index: i,
  rest_seconds: 120,
}));

// Twelve weeks of logs on a Mon/Wed/Fri rhythm with a slow upward load trend,
// so the 1RM chart and the training heatmap both have something to show.
export const demoTrainingLogs = (() => {
  const logs: Record<string, unknown>[] = [];
  let n = 0;
  for (let d = 84; d >= 0; d--) {
    const wd = weekdayIndex(d);
    if (![0, 2, 4].includes(wd)) continue;
    const dayLabel = wd === 0 ? "Push" : wd === 2 ? "Pull" : "Legs";
    const progress = (84 - d) / 84; // 0 → 1 across the window
    exerciseDefs.forEach((e, i) => {
      if (e.day !== dayLabel) return;
      const weight = Math.round((e.base * (1 + progress * 0.12)) / 2.5) * 2.5;
      logs.push({
        id: uid("tlog", n++),
        exercise_id: uid("ex", i),
        user_id: USER_ID,
        date: day(d),
        sets_completed: Array.from({ length: e.sets }, (_, s) => ({
          set: s + 1,
          weight_kg: weight,
          reps: e.reps - (s > 1 ? 1 : 0),
        })),
        created_at: iso(d, 18),
      });
    });
  }
  return logs;
})();

// ── Nutrition ───────────────────────────────────────────────────────

const mealPlan = [
  {
    meal: "frühstück",
    food: "Haferflocken mit Blaubeeren",
    g: 320,
    kcal: 412,
    p: 14.2,
    c: 62.1,
    f: 9.8,
    fib: 8.4,
  },
  { meal: "frühstück", food: "Skyr Natur", g: 200, kcal: 128, p: 22.0, c: 8.0, f: 0.4, fib: 0 },
  {
    meal: "mittagessen",
    food: "Hähnchenbrust gegrillt",
    g: 220,
    kcal: 363,
    p: 68.2,
    c: 0,
    f: 8.1,
    fib: 0,
  },
  {
    meal: "mittagessen",
    food: "Basmatireis gekocht",
    g: 250,
    kcal: 325,
    p: 6.8,
    c: 70.5,
    f: 0.8,
    fib: 1.5,
  },
  {
    meal: "mittagessen",
    food: "Brokkoli gedünstet",
    g: 180,
    kcal: 61,
    p: 5.0,
    c: 7.2,
    f: 0.6,
    fib: 4.7,
  },
  { meal: "snack", food: "Banane", g: 120, kcal: 107, p: 1.3, c: 25.2, f: 0.4, fib: 3.1 },
  { meal: "snack", food: "Mandeln", g: 30, kcal: 174, p: 6.4, c: 1.8, f: 15.0, fib: 3.8 },
  { meal: "abendessen", food: "Lachsfilet", g: 180, kcal: 371, p: 36.5, c: 0, f: 24.3, fib: 0 },
  {
    meal: "abendessen",
    food: "Süßkartoffel gebacken",
    g: 250,
    kcal: 215,
    p: 4.0,
    c: 47.5,
    f: 0.4,
    fib: 7.5,
  },
];

export const demoNutritionLog = mealPlan.map((m, i) => ({
  id: uid("nutri", i),
  user_id: USER_ID,
  date: day(0),
  meal_type: m.meal,
  food_name: m.food,
  barcode: null,
  calories: m.kcal,
  protein_g: m.p,
  carbs_g: m.c,
  fat_g: m.f,
  fiber_g: m.fib,
  quantity_g: m.g,
  // Rough per-item micronutrient contributions, scaled so the daily totals land
  // in a realistic band against the RDA bars.
  vitamin_a_mcg: Math.round(m.g * 0.44),
  vitamin_c_mg: Math.round(m.g * 0.05 * 10) / 10,
  vitamin_d_mcg: Math.round(m.g * 0.009 * 10) / 10,
  calcium_mg: Math.round(m.g * 0.5),
  iron_mg: Math.round(m.g * 0.005 * 10) / 10,
  potassium_mg: Math.round(m.g * 1.35),
  sodium_mg: Math.round(m.g * 1.05),
  created_at: iso(0, 8 + i),
}));

export const demoWaterLog = [600, 500, 750, 400, 500].map((ml, i) => ({
  id: uid("water", i),
  user_id: USER_ID,
  date: day(0),
  amount_ml: ml,
  logged_at: iso(0, 8 + i * 2),
}));

export const demoCustomFoods = [
  {
    id: uid("food", 0),
    user_id: USER_ID,
    name: "Proteinshake (eigene Mischung)",
    calories_100: 380,
    protein_100: 72,
    carbs_100: 8,
    fat_100: 5,
    created_at: iso(30),
  },
];

// ── Body weight ─────────────────────────────────────────────────────

export const demoWeightLog = Array.from({ length: 12 }, (_, i) => {
  const d = 77 - i * 7;
  return {
    id: uid("weight", i),
    user_id: USER_ID,
    date: day(d),
    // Gentle recomposition trend with a little week-to-week noise.
    weight_kg: Math.round((81.4 - i * 0.22 + Math.sin(i) * 0.3) * 10) / 10,
    body_fat_percent: Math.round((17.8 - i * 0.18) * 10) / 10,
    muscle_mass_kg: Math.round((37.2 + i * 0.08) * 10) / 10,
    waist_cm: Math.round((84 - i * 0.15) * 10) / 10,
    notes: null,
  };
});

// ── Cardio ──────────────────────────────────────────────────────────

/** Encode [lat, lng][] to the Google polyline format the map components expect. */
function encodePolyline(points: [number, number][]): string {
  let encoded = "";
  let pLat = 0;
  let pLng = 0;
  for (const [lat, lng] of points) {
    const dLat = Math.round(lat * 1e5) - pLat;
    const dLng = Math.round(lng * 1e5) - pLng;
    pLat += dLat;
    pLng += dLng;
    for (const d of [dLat, dLng]) {
      let v = d < 0 ? ~(d << 1) : d << 1;
      while (v >= 0x20) {
        encoded += String.fromCharCode(((v & 0x1f) | 0x20) + 63);
        v >>= 5;
      }
      encoded += String.fromCharCode(v + 63);
    }
  }
  return encoded;
}

/**
 * Synthetic loop through Frankfurt's Grüneburgpark, a public green space.
 * Deliberately not a real recorded track.
 */
function parkLoop(points: number): [number, number][] {
  const centerLat = 50.1266;
  const centerLng = 8.6603;
  return Array.from({ length: points }, (_, i) => {
    const t = (i / points) * Math.PI * 2;
    const wobble = 1 + Math.sin(t * 3) * 0.12;
    return [
      Math.round((centerLat + Math.sin(t) * 0.0062 * wobble) * 1e6) / 1e6,
      Math.round((centerLng + Math.cos(t) * 0.0085 * wobble) * 1e6) / 1e6,
    ];
  });
}

const runDefs = [
  { daysAgo: 2, name: "Lauf am Abend", km: 8.2, paceSec: 312, hr: 152, elev: 46 },
  { daysAgo: 5, name: "Intervalle 6x800m", km: 9.6, paceSec: 268, hr: 168, elev: 22 },
  { daysAgo: 9, name: "Longrun am Sonntag", km: 15.4, paceSec: 338, hr: 145, elev: 88 },
  { daysAgo: 12, name: "Lockerer Dauerlauf", km: 6.1, paceSec: 352, hr: 138, elev: 31 },
  { daysAgo: 16, name: "Tempolauf", km: 10.0, paceSec: 285, hr: 161, elev: 40 },
];

export const demoCardioActivities = runDefs.map((r, i) => {
  const moving = Math.round(r.km * r.paceSec);
  return {
    id: uid("cardio", i),
    user_id: USER_ID,
    source: "strava",
    external_id: `demo-${i}`,
    activity_type: "Run",
    name: r.name,
    start_date: iso(r.daysAgo, 18, 15),
    elapsed_time_sec: moving + 90,
    moving_time_sec: moving,
    distance_m: Math.round(r.km * 1000),
    elevation_gain_m: r.elev,
    avg_heartrate: r.hr,
    max_heartrate: r.hr + 18,
    avg_speed_ms: Math.round((1000 / r.paceSec) * 100) / 100,
    avg_pace_sec_per_km: r.paceSec,
    calories: Math.round(r.km * 68),
    raw_data: { map: { summary_polyline: encodePolyline(parkLoop(90)) } },
    created_at: iso(r.daysAgo, 19),
  };
});

export const demoCardioGoals = [
  { user_id: USER_ID, goal_type: "weekly_km", target_value: 30, updated_at: iso(7) },
  { user_id: USER_ID, goal_type: "monthly_km", target_value: 120, updated_at: iso(7) },
];

// ── Garmin biometrics ───────────────────────────────────────────────

export const demoGarminHealthData = Array.from({ length: 14 }, (_, i) => {
  const d = 13 - i;
  const wave = Math.sin(i / 2);
  return {
    user_id: USER_ID,
    date: day(d),
    data: {
      date: day(d),
      daily: {
        steps: 7400 + Math.round(wave * 2600) + i * 45,
        distance_m: 5600 + Math.round(wave * 2000),
        calories_total: 2680 + Math.round(wave * 180),
        calories_active: 720 + Math.round(wave * 210),
        calories_bmr: 1960,
        floors_climbed: 9 + (i % 5),
        resting_hr: 52 - Math.round(wave),
        min_hr: 46,
        max_hr: 168,
        avg_stress: 28 + Math.round(wave * 8),
        max_stress: 74,
        body_battery_high: 88 + Math.round(wave * 6),
        body_battery_low: 24 + Math.round(wave * 5),
        moderate_intensity_min: 32,
        vigorous_intensity_min: 18,
      },
      sleep: {
        start: null,
        end: null,
        duration_sec: 26_400 + Math.round(wave * 2400),
        deep_sec: 5400 + Math.round(wave * 600),
        light_sec: 14_400,
        rem_sec: 5400 + Math.round(wave * 500),
        awake_sec: 1200,
        score: 78 + Math.round(wave * 9),
        score_quality: "GOOD",
        avg_spo2: 96,
        avg_respiration: 14.2,
      },
      hrv: {
        weekly_avg: 68,
        last_night: 66 + Math.round(wave * 9),
        last_night_5min_high: 92,
        baseline_low: 54,
        baseline_balanced_low: 60,
        baseline_balanced_upper: 82,
        status: "BALANCED",
      },
      stress: {
        avg: 28 + Math.round(wave * 8),
        rest_stress_duration_sec: 28_800,
        low_stress_duration_sec: 21_600,
        medium_stress_duration_sec: 7200,
        high_stress_duration_sec: 1800,
      },
      vo2max: { generic: 51.2, running: 51.8, cycling: null, fitness_age: 24 },
    },
  };
});

// ── Misc ────────────────────────────────────────────────────────────

export const demoUserProfile = [
  {
    id: USER_ID,
    name: "Demo",
    birth_date: "1999-04-12",
    height_cm: 183,
    calorie_goal: 2800,
    protein_goal: 170,
    carbs_goal: 320,
    fat_goal: 78,
    water_goal_ml: 3000,
    created_at: iso(200),
  },
];

export const demoSportTodos = [
  {
    id: uid("stodo", 0),
    user_id: USER_ID,
    title: "Foam Rolling Beine",
    description: null,
    due_date: day(0),
    completed: false,
    priority: "mittel",
    category: "mobility",
    created_at: iso(0, 7),
  },
];

// ── Food lookup catalogue ───────────────────────────────────────────

function demoFood(
  id: string,
  name: string,
  brand: string | null,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
) {
  return {
    id,
    name,
    brand,
    servings: [
      {
        id: `${id}-serving`,
        description: "100 g",
        metricAmount: 100,
        metricUnit: "g",
        calories: kcal,
        protein,
        carbs,
        fat,
        fiber,
        vitaminA: Math.round(kcal * 0.4),
        vitaminC: Math.round(kcal * 0.05),
        vitaminD: 0.4,
        calcium: Math.round(kcal * 0.3),
        iron: Math.round(kcal * 0.008 * 10) / 10,
        potassium: Math.round(kcal * 1.6),
        sodium: Math.round(kcal * 0.5),
      },
    ],
  };
}

/** Stands in for the Open Food Facts database when running in demo mode. */
export const demoFoodCatalogue = [
  demoFood("demo-food-1", "Haferflocken", "Kölln", 372, 13.5, 58.7, 7.0, 10.0),
  demoFood("demo-food-2", "Skyr Natur", "Arla", 64, 11.0, 4.0, 0.2, 0),
  demoFood("demo-food-3", "Hähnchenbrustfilet", null, 165, 31.0, 0, 3.6, 0),
  demoFood("demo-food-4", "Basmatireis gekocht", null, 130, 2.7, 28.2, 0.3, 0.6),
  demoFood("demo-food-5", "Lachsfilet", null, 206, 20.3, 0, 13.5, 0),
  demoFood("demo-food-6", "Banane", null, 89, 1.1, 21.0, 0.3, 2.6),
  demoFood("demo-food-7", "Mandeln", null, 579, 21.2, 6.1, 49.9, 12.5),
  demoFood("demo-food-8", "Brokkoli gedünstet", null, 34, 2.8, 4.0, 0.4, 2.6),
];

/** Table name → fixture rows. Tables not listed resolve to an empty result. */
export const demoTables: Record<string, Record<string, unknown>[]> = {
  routines: demoRoutines,
  routine_items: demoRoutineItems,
  routine_logs: demoRoutineLogs,
  training_plans: demoTrainingPlans,
  training_exercises: demoTrainingExercises,
  training_logs: demoTrainingLogs,
  nutrition_log: demoNutritionLog,
  water_log: demoWaterLog,
  custom_foods: demoCustomFoods,
  weight_log: demoWeightLog,
  cardio_activities: demoCardioActivities,
  cardio_goals: demoCardioGoals,
  garmin_health_data: demoGarminHealthData,
  user_profiles: demoUserProfile,
  sport_todos: demoSportTodos,
  daily_todos: [],
  weekly_reports: [],
};
