import { useState, useEffect, useMemo } from "react";
import { Target, Flame, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import type { CardioActivity } from "@/types/database";
import { getWeekStart } from "./ausdauer-utils";

interface Goal {
  goal_type: string;
  target_value: number;
}

function ProgressRing({ progress, size = 80, stroke = 6, color }: { progress: number; size?: number; stroke?: number; color: string }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - Math.min(progress, 1) * circ;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#222" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}

function computeStreak(activities: CardioActivity[], weeklyTarget: number): number {
  if (weeklyTarget <= 0) return 0;

  const now = new Date();
  let streak = 0;
  let checkDate = new Date(now);

  // Start from last week (current week is ongoing)
  checkDate.setDate(checkDate.getDate() - 7);

  for (let i = 0; i < 52; i++) {
    const ws = getWeekStart(checkDate);
    const we = new Date(ws);
    we.setDate(we.getDate() + 7);

    const weekKm = activities
      .filter((a) => {
        const d = new Date(a.start_date);
        return d >= ws && d < we;
      })
      .reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000;

    if (weekKm >= weeklyTarget) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 7);
    } else {
      break;
    }
  }

  return streak;
}

export function TabGoals({ activities }: { activities: CardioActivity[] }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("cardio_goals")
        .select("goal_type, target_value")
        .eq("user_id", USER_ID);
      setGoals(data ?? []);
    };
    load();
  }, []);

  const saveGoal = async (goalType: string, value: number) => {
    await supabase.from("cardio_goals").upsert({
      user_id: USER_ID,
      goal_type: goalType,
      target_value: value,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,goal_type" });

    setGoals((prev) => {
      const filtered = prev.filter((g) => g.goal_type !== goalType);
      return [...filtered, { goal_type: goalType, target_value: value }];
    });
    setEditing(null);
  };

  const { weekKm, monthKm } = useMemo(() => {
    const now = new Date();
    const ws = getWeekStart(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let wk = 0, mk = 0;
    for (const a of activities) {
      const d = new Date(a.start_date);
      const dist = a.distance_m ?? 0;
      if (d >= ws) wk += dist;
      if (d >= monthStart) mk += dist;
    }
    return { weekKm: wk / 1000, monthKm: mk / 1000 };
  }, [activities]);

  const weeklyGoal = goals.find((g) => g.goal_type === "weekly_km")?.target_value ?? 0;
  const monthlyGoal = goals.find((g) => g.goal_type === "monthly_km")?.target_value ?? 0;

  const streak = useMemo(() => computeStreak(activities, weeklyGoal), [activities, weeklyGoal]);

  const goalItems = [
    { type: "weekly_km", label: "Wochenziel", current: weekKm, target: weeklyGoal, unit: "km", color: "#FC4C02" },
    { type: "monthly_km", label: "Monatsziel", current: monthKm, target: monthlyGoal, unit: "km", color: "#3B82F6" },
  ];

  return (
    <div className="space-y-3">
      {/* Streak */}
      {streak > 0 && weeklyGoal > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-[#1A1A1A] px-4 py-3">
          <Flame className="h-5 w-5 text-orange-400" />
          <div>
            <p className="text-sm font-bold">{streak} {streak === 1 ? "Woche" : "Wochen"} in Folge</p>
            <p className="text-[10px] text-neutral-500">Wochenziel erreicht</p>
          </div>
        </div>
      )}

      {/* Goal cards */}
      {goalItems.map((g) => {
        const progress = g.target > 0 ? g.current / g.target : 0;
        const isEditing = editing === g.type;
        const done = progress >= 1;

        return (
          <div key={g.type} className="rounded-xl bg-[#1A1A1A] p-4">
            <div className="flex items-center gap-4">
              {/* Progress ring */}
              <div className="relative shrink-0">
                <ProgressRing progress={progress} color={done ? "#22C55E" : g.color} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  {done ? (
                    <Check className="h-5 w-5 text-green-400" />
                  ) : (
                    <span className="text-sm font-bold">{Math.round(progress * 100)}%</span>
                  )}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1">
                <p className="text-xs font-medium text-neutral-400">{g.label}</p>
                <p className="text-lg font-bold">{g.current.toFixed(1)} <span className="text-sm text-neutral-500">/ {g.target > 0 ? g.target : "–"} {g.unit}</span></p>
                {g.target > 0 && !done && (
                  <p className="text-[10px] text-neutral-600">Noch {(g.target - g.current).toFixed(1)} {g.unit}</p>
                )}
              </div>

              {/* Edit button */}
              <button
                onClick={() => { setEditing(isEditing ? null : g.type); setEditValue(String(g.target || "")); }}
                className="rounded-lg bg-neutral-800 px-2.5 py-1.5 text-[10px] font-medium text-neutral-400 active:scale-95"
              >
                <Target className="h-3 w-3" />
              </button>
            </div>

            {/* Edit form */}
            {isEditing && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-800">
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="z.B. 30"
                  className="flex-1 rounded-lg bg-neutral-800 px-3 py-2 text-sm border-none outline-none"
                  autoFocus
                />
                <span className="text-xs text-neutral-500">{g.unit}</span>
                <button
                  onClick={() => saveGoal(g.type, Number(editValue) || 0)}
                  className="rounded-lg bg-[#FC4C02] px-3 py-2 text-xs font-bold text-white active:scale-95"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Hint */}
      {weeklyGoal === 0 && monthlyGoal === 0 && (
        <p className="text-center text-xs text-neutral-600 py-4">
          Tippe auf <Target className="inline h-3 w-3" /> um ein Ziel zu setzen
        </p>
      )}
    </div>
  );
}
