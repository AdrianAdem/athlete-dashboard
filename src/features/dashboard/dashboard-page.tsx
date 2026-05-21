import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, Circle, Dumbbell, Flame, Droplets, Scale,
  ChevronRight, TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString, cn, isRoutineActiveToday } from "@/lib/utils";
import type { DailyTodo, NutritionLog, WaterLog, WeightLog, Routine } from "@/types/database";

export function DashboardPage() {
  const navigate = useNavigate();
  const [todos, setTodos] = useState<DailyTodo[]>([]);
  const [nutritionTotal, setNutritionTotal] = useState({ calories: 0, protein: 0 });
  const [waterTotal, setWaterTotal] = useState(0);
  const [latestWeight, setLatestWeight] = useState<WeightLog | null>(null);
  const [trainingCount, setTrainingCount] = useState(0);
  const [routineStats, setRoutineStats] = useState<{ total: number; done: number; items: { name: string; done: boolean }[] }>({ total: 0, done: 0, items: [] });
  const [calorieGoal, setCalorieGoal] = useState(2500);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    const today = todayString();

    const [todosRes, nutritionRes, waterRes, weightRes, trainingRes] = await Promise.all([
      supabase.from("daily_todos").select("*").eq("user_id", USER_ID).eq("due_date", today).order("created_at", { ascending: false }),
      supabase.from("nutrition_log").select("calories, protein_g").eq("user_id", USER_ID).eq("date", today),
      supabase.from("water_log").select("amount_ml").eq("user_id", USER_ID).eq("date", today),
      supabase.from("weight_log").select("*").eq("user_id", USER_ID).order("date", { ascending: false }).limit(1),
      supabase.from("training_logs").select("id").eq("user_id", USER_ID).eq("date", today),
    ]);

    if (todosRes.data) setTodos(todosRes.data as DailyTodo[]);
    if (nutritionRes.data) {
      const totals = (nutritionRes.data as NutritionLog[]).reduce(
        (acc, n) => ({ calories: acc.calories + n.calories, protein: acc.protein + n.protein_g }),
        { calories: 0, protein: 0 }
      );
      setNutritionTotal(totals);
    }
    if (waterRes.data) {
      setWaterTotal((waterRes.data as WaterLog[]).reduce((s, w) => s + w.amount_ml, 0));
    }
    if (weightRes.data?.[0]) setLatestWeight(weightRes.data[0] as WeightLog);
    if (trainingRes.data) setTrainingCount(trainingRes.data.length);

    const { data: profile } = await supabase
      .from("user_profiles").select("calorie_goal").eq("id", USER_ID).single();
    if (profile?.calorie_goal) setCalorieGoal(profile.calorie_goal);

    // Fetch routines
    const { data: routinesData } = await supabase
      .from("routines").select("id, name, area, weekdays, start_date, end_date").eq("user_id", USER_ID).eq("is_active", true);
    if (routinesData) {
      const jsDay = new Date().getDay();
      const weekday = jsDay === 0 ? 6 : jsDay - 1;
      const todayRoutines = (routinesData as Routine[]).filter(
        (r) => (!r.weekdays || r.weekdays.length === 0 || r.weekdays.includes(weekday))
          && isRoutineActiveToday(r.start_date, r.end_date)
      );
      const routineIds = todayRoutines.map((r) => r.id);
      const { data: allLogs } = routineIds.length > 0
        ? await supabase.from("routine_logs").select("routine_id, completed").in("routine_id", routineIds).eq("user_id", USER_ID).eq("date", today)
        : { data: [] };
      const logMap = new Map((allLogs ?? []).map((l) => [l.routine_id, l.completed]));
      const items = todayRoutines.map((r) => ({
        name: r.name,
        done: !!logMap.get(r.id),
      }));
      setRoutineStats({
        total: items.length,
        done: items.filter((i) => i.done).length,
        items,
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const toggleTodo = async (todo: DailyTodo) => {
    setTodos((prev) => prev.map((t) => t.id === todo.id ? { ...t, completed: !t.completed } : t));
    await supabase.from("daily_todos").update({ completed: !todo.completed }).eq("id", todo.id);
  };

  const todosCompleted = todos.filter((t) => t.completed).length;
  const todosTotal = todos.length;
  const todosPct = todosTotal > 0 ? Math.round((todosCompleted / todosTotal) * 100) : 0;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;
  }

  return (
    <div className="space-y-6 p-4 pb-6">
      {/* Header */}
      <div>
        <p className="text-sm text-neutral-500">
          {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Hey Adrian</h1>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Flame className="h-5 w-5 text-orange-500" />}
          label="Kalorien"
          value={`${nutritionTotal.calories}`}
          sub={`/ ${calorieGoal} kcal`}
          onClick={() => navigate("/ernaehrung")}
        />
        <StatCard
          icon={<Droplets className="h-5 w-5 text-blue-400" />}
          label="Wasser"
          value={`${(waterTotal / 1000).toFixed(1)}L`}
          sub="/ 3.0L"
          onClick={() => navigate("/ernaehrung")}
        />
        <StatCard
          icon={<Dumbbell className="h-5 w-5 text-green-500" />}
          label="Training"
          value={trainingCount > 0 ? `${trainingCount} Übungen` : "Kein Training"}
          sub="heute"
          onClick={() => navigate("/sport/loggen")}
        />
        <StatCard
          icon={<Scale className="h-5 w-5 text-purple-400" />}
          label="Gewicht"
          value={latestWeight ? `${latestWeight.weight_kg} kg` : "—"}
          sub={latestWeight?.body_fat_percent ? `${latestWeight.body_fat_percent}% KFA` : "kein Eintrag"}
          onClick={() => navigate("/sport/gewicht")}
        />
      </div>

      {/* Routines section */}
      {routineStats.total > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Routinen</h2>
            <span className="text-xs text-neutral-500">{routineStats.done}/{routineStats.total} erledigt</span>
          </div>
          <div className="space-y-2">
            {routineStats.items.map((r, i) => (
              <button key={i}
                onClick={() => navigate("/sport/todos")}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left transition-all active:scale-[0.98]",
                  r.done && "opacity-50"
                )}>
                {r.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-neutral-600" />
                )}
                <span className={cn("text-sm flex-1", r.done && "line-through")}>{r.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Todos section */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Tages-Todos</h2>
          <button
            onClick={() => navigate("/sport/todos")}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-white"
          >
            Alle <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {/* Progress bar */}
        {todosTotal > 0 && (
          <div className="mb-3">
            <div className="mb-1 flex justify-between text-xs text-neutral-500">
              <span>{todosCompleted}/{todosTotal} erledigt</span>
              <span>{todosPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${todosPct}%` }}
              />
            </div>
          </div>
        )}

        {todosTotal === 0 ? (
          <div className="rounded-xl bg-card p-6 text-center">
            <p className="text-sm text-neutral-500">Keine Todos für heute</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todos.slice(0, 5).map((todo) => (
              <button
                key={todo.id}
                onClick={() => toggleTodo(todo)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left transition-all active:scale-[0.98]",
                  todo.completed && "opacity-50"
                )}
              >
                {todo.completed ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-neutral-600" />
                )}
                <span className={cn("text-sm", todo.completed && "line-through")}>
                  {todo.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-lg font-bold">Schnellzugriff</h2>
        <div className="grid grid-cols-3 gap-2">
          <QuickAction label="Training starten" icon={<Dumbbell className="h-5 w-5" />} onClick={() => navigate("/sport/loggen")} />
          <QuickAction label="Essen tracken" icon={<Flame className="h-5 w-5" />} onClick={() => navigate("/ernaehrung")} />
          <QuickAction label="Fortschritt" icon={<TrendingUp className="h-5 w-5" />} onClick={() => navigate("/sport/statistiken")} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2 rounded-xl bg-card p-4 text-left transition-all active:scale-[0.98]"
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-neutral-500">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-neutral-500">{sub}</p>
    </button>
  );
}

function QuickAction({ label, icon, onClick }: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl bg-card p-4 text-center transition-all active:scale-[0.98]"
    >
      <div className="text-neutral-400">{icon}</div>
      <span className="text-[11px] font-medium text-neutral-400">{label}</span>
    </button>
  );
}
