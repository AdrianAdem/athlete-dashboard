export type MealType = "frühstück" | "mittagessen" | "abendessen" | "snack";
export type TodoPriority = "hoch" | "mittel" | "niedrig";
export type SportCategory = "kraft" | "cardio" | "mobility" | "sonstiges";
export type RoutineCategory = "kraft" | "cardio" | "mobility" | "sonstiges" | "gesundheit" | "morgenroutine" | "abendroutine";
export type RoutineArea = "alltag" | "sport";

export interface UserProfile {
  id: string;
  name: string;
  birth_date: string | null;
  height_cm: number | null;
  calorie_goal: number;
  protein_goal: number;
  carbs_goal: number;
  fat_goal: number;
  water_goal_ml: number;
  created_at: string;
}

export interface DailyTodo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string;
  completed: boolean;
  priority: TodoPriority;
  created_at: string;
}

export interface SportTodo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  due_date: string;
  completed: boolean;
  priority: TodoPriority;
  category: SportCategory;
  created_at: string;
}

export interface TrainingPlan {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TrainingExercise {
  id: string;
  plan_id: string;
  name: string;
  muscle_group: string;
  sets: number;
  reps: number;
  day_label: string;
  order_index: number;
}

export interface SetLog {
  set: number;
  weight_kg: number;
  reps: number;
}

export interface TrainingLog {
  id: string;
  exercise_id: string;
  user_id: string;
  date: string;
  sets_completed: SetLog[];
  created_at: string;
}

export interface NutritionLog {
  id: string;
  user_id: string;
  date: string;
  meal_type: MealType;
  food_name: string;
  barcode: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  quantity_g: number;
  created_at: string;
}

export interface WaterLog {
  id: string;
  user_id: string;
  date: string;
  amount_ml: number;
  logged_at: string;
}

export interface WeightLog {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number;
  body_fat_percent: number | null;
  muscle_mass_kg: number | null;
  waist_cm: number | null;
  notes: string | null;
}

export interface WeeklyReport {
  id: string;
  user_id: string;
  week_start: string;
  report_json: Record<string, unknown>;
  generated_at: string;
}

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  area: RoutineArea;
  category: RoutineCategory;
  weekdays: number[] | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RoutineItem {
  id: string;
  routine_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  duration_sec: number | null;
  notes: string | null;
  order_index: number;
}

export interface RoutineLog {
  id: string;
  routine_id: string;
  user_id: string;
  date: string;
  completed_items: string[]; // item IDs that are completed
  completed: boolean;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  google_event_id: string | null;
  calendar_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  color: string | null;
  synced_at: string;
}

export interface MicronutrientLog {
  id: string;
  user_id: string;
  date: string;
  vitamin_a_mcg: number;
  vitamin_c_mg: number;
  vitamin_d_mcg: number;
  vitamin_e_mg: number;
  vitamin_k_mcg: number;
  vitamin_b12_mcg: number;
  iron_mg: number;
  calcium_mg: number;
  magnesium_mg: number;
  zinc_mg: number;
  potassium_mg: number;
  sodium_mg: number;
  fiber_g: number;
  omega3_mg: number;
  notes: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
