import { useState, useEffect, useCallback, useRef } from "react";
import { Play, ChevronLeft, Plus, Check, Trophy, Flame, X, SkipForward, Minus, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { TrainingExercise, SetLog } from "@/types/database";

interface WorkoutSet extends SetLog {
  completed: boolean;
}

interface WorkoutExercise extends TrainingExercise {
  sets_data: WorkoutSet[];
  previous_log: SetLog[] | null;
  saved: boolean;
}

interface WorkoutSummary {
  dayLabel: string;
  totalSets: number;
  totalWeightKg: number;
  durationMin: number;
  exercises: { name: string; muscle_group: string; isPR: boolean; improvement: number }[];
  records: number;
}

const DEFAULT_REST = 180; // 3:00 default like Hevy

export function TrainingLogPage() {
  const [workoutActive, setWorkoutActive] = useState(false);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dayLabel, setDayLabel] = useState("");
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [restTimer, setRestTimer] = useState(0);
  const [restDuration, setRestDuration] = useState(DEFAULT_REST);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const workoutStartTime = useRef<Date | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [history, setHistory] = useState<{ date: string; exercises: { name: string; sets: SetLog[] }[] }[]>([]);

  const totalSetsCount = exercises.reduce((sum, ex) => sum + ex.sets_data.length, 0);
  const completedSetsCount = exercises.reduce(
    (sum, ex) => sum + ex.sets_data.filter((s) => s.completed).length, 0
  );

  const fetchActivePlan = useCallback(async () => {
    const { data: plans } = await supabase
      .from("training_plans").select("id").eq("user_id", USER_ID).eq("is_active", true).single();
    if (!plans) { setLoading(false); return; }
    const { data: exs } = await supabase
      .from("training_exercises").select("*").eq("plan_id", plans.id).order("order_index");
    if (exs) {
      setAvailableDays([...new Set((exs as TrainingExercise[]).map((e) => e.day_label))]);
    }

    const { data: logs } = await supabase
      .from("training_logs").select("date, sets_completed, training_exercises(name)")
      .eq("user_id", USER_ID).order("date", { ascending: false }).limit(50);
    if (logs) {
      const grouped = new Map<string, { name: string; sets: SetLog[] }[]>();
      for (const log of logs as { date: string; sets_completed: SetLog[]; training_exercises: { name: string } | null }[]) {
        const arr = grouped.get(log.date) ?? [];
        arr.push({ name: log.training_exercises?.name ?? "?", sets: log.sets_completed });
        grouped.set(log.date, arr);
      }
      setHistory(Array.from(grouped, ([date, exercises]) => ({ date, exercises })));
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchActivePlan(); }, [fetchActivePlan]);

  // Timer tick
  useEffect(() => {
    if (!timerActive) return;
    timerRef.current = setInterval(() => {
      setRestTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimerActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  const startWorkout = async () => {
    if (!dayLabel) return;
    const { data: plans } = await supabase
      .from("training_plans").select("id").eq("user_id", USER_ID).eq("is_active", true).single();
    if (!plans) return;
    const { data: exs } = await supabase
      .from("training_exercises").select("*").eq("plan_id", plans.id).eq("day_label", dayLabel).order("order_index");
    if (!exs) return;

    const exercisesWithPrev: WorkoutExercise[] = await Promise.all(
      (exs as TrainingExercise[]).map(async (ex) => {
        const { data: prevLog } = await supabase
          .from("training_logs").select("sets_completed").eq("exercise_id", ex.id)
          .eq("user_id", USER_ID).order("date", { ascending: false }).limit(1).single();
        const prevSets = prevLog ? (prevLog.sets_completed as SetLog[]) : null;
        return {
          ...ex,
          sets_data: Array.from({ length: ex.sets }, (_, i) => ({
            set: i + 1,
            // Pre-fill with previous weights if available
            weight_kg: prevSets?.[i]?.weight_kg ?? 0,
            reps: prevSets?.[i]?.reps ?? ex.reps,
            completed: false,
          })),
          previous_log: prevSets,
          saved: false,
        };
      })
    );
    setExercises(exercisesWithPrev);
    setCurrentExIdx(0);
    setWorkoutActive(true);
    workoutStartTime.current = new Date();
  };

  const updateSet = (exIdx: number, setIdx: number, field: "weight_kg" | "reps", value: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => i === exIdx
        ? { ...ex, sets_data: ex.sets_data.map((s, j) => j === setIdx ? { ...s, [field]: value } : s) }
        : ex
      )
    );
  };

  const toggleSetComplete = (exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const newSets = ex.sets_data.map((s, j) => {
          if (j !== setIdx) return s;
          const nowCompleted = !s.completed;
          // Start rest timer when completing a set
          if (nowCompleted) {
            startRestTimer();
          }
          return { ...s, completed: nowCompleted };
        });
        return { ...ex, sets_data: newSets };
      })
    );
  };

  const addSet = (exIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const lastSet = ex.sets_data[ex.sets_data.length - 1];
        return {
          ...ex,
          sets_data: [
            ...ex.sets_data,
            { set: ex.sets_data.length + 1, weight_kg: lastSet?.weight_kg ?? 0, reps: lastSet?.reps ?? ex.reps, completed: false },
          ],
        };
      })
    );
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx || ex.sets_data.length <= 1) return ex;
        return {
          ...ex,
          sets_data: ex.sets_data.filter((_, j) => j !== setIdx).map((s, j) => ({ ...s, set: j + 1 })),
        };
      })
    );
  };

  const startRestTimer = () => {
    setRestTimer(restDuration);
    setTimerActive(true);
  };

  const skipTimer = () => {
    clearInterval(timerRef.current);
    setRestTimer(0);
    setTimerActive(false);
  };

  const adjustTimer = (delta: number) => {
    setRestTimer((prev) => Math.max(0, prev + delta));
  };

  const saveExercise = async (exIdx: number) => {
    const ex = exercises[exIdx];
    const completedSets = ex.sets_data.filter((s) => s.completed);
    if (completedSets.length === 0) return;

    await supabase.from("training_logs").insert({
      exercise_id: ex.id, user_id: USER_ID, date: todayString(),
      sets_completed: completedSets.map(({ completed: _, ...s }) => s),
    });
    setExercises((prev) => prev.map((e, i) => (i === exIdx ? { ...e, saved: true } : e)));
  };

  const goToNextExercise = () => {
    // Auto-save current if all sets completed
    const current = exercises[currentExIdx];
    if (current && !current.saved && current.sets_data.every((s) => s.completed)) {
      saveExercise(currentExIdx);
    }
    if (currentExIdx < exercises.length - 1) {
      setCurrentExIdx(currentExIdx + 1);
    }
  };

  const goToPrevExercise = () => {
    if (currentExIdx > 0) {
      setCurrentExIdx(currentExIdx - 1);
    }
  };

  const finishWorkout = async () => {
    // Save any unsaved exercises with completed sets
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex.saved && ex.sets_data.some((s) => s.completed)) {
        await saveExercise(i);
      }
    }

    const duration = workoutStartTime.current
      ? Math.round((Date.now() - workoutStartTime.current.getTime()) / 60000)
      : 0;

    let totalSets = 0;
    let totalWeight = 0;
    let records = 0;

    const exSummaries = exercises.map((ex) => {
      const completed = ex.sets_data.filter((s) => s.completed);
      totalSets += completed.length;
      const exWeight = completed.reduce((s, set) => s + set.weight_kg * set.reps, 0);
      totalWeight += exWeight;

      const currentMax = Math.max(...completed.map((s) => s.weight_kg), 0);
      const prevMax = ex.previous_log ? Math.max(...ex.previous_log.map((s) => s.weight_kg), 0) : 0;
      const isPR = prevMax > 0 && currentMax > prevMax;
      const improvement = prevMax > 0 ? ((currentMax - prevMax) / prevMax) * 100 : 0;
      if (isPR) records++;

      return { name: ex.name, muscle_group: ex.muscle_group, isPR, improvement };
    });

    setSummary({ dayLabel, totalSets, totalWeightKg: Math.round(totalWeight), durationMin: duration, exercises: exSummaries, records });
    skipTimer();
    setWorkoutActive(false);
    setExercises([]);
    setDayLabel("");
  };

  const closeSummary = () => {
    setSummary(null);
    fetchActivePlan();
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;

  // ── Workout Summary ──
  if (summary) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-neutral-900 to-black p-4">
        <div className="flex justify-end">
          <button onClick={closeSummary} className="rounded-full bg-neutral-800 p-2">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <p className="text-lg text-neutral-400">Glückwunsch!</p>
          <div className="text-center">
            <p className="text-neutral-400">Du hast</p>
            <p className="text-3xl font-bold">
              {summary.totalSets} Sets <span className="text-neutral-500">mit</span>
            </p>
            <p className="text-3xl font-bold">
              {summary.totalWeightKg.toLocaleString()} kg
              <span className="text-neutral-500"> in </span>
              {summary.durationMin} min
            </p>
            <p className="text-neutral-400">absolviert</p>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1.5">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-sm">{Math.round(summary.totalWeightKg * 0.03)} kcal</span>
            </div>
            {summary.records > 0 && (
              <div className="flex items-center gap-1.5 rounded-full bg-neutral-800 px-3 py-1.5">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <span className="text-sm">{summary.records} Rekord{summary.records > 1 ? "e" : ""}</span>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {summary.exercises.map((ex, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-card p-4">
              <div>
                <p className="text-sm font-medium">{ex.name}</p>
                <p className="text-xs text-neutral-500">{ex.muscle_group}</p>
              </div>
              <div className="flex items-center gap-2">
                {ex.isPR && (
                  <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-500">PR</span>
                )}
                {ex.improvement > 0 && (
                  <span className="text-xs font-medium text-green-500">+{ex.improvement.toFixed(1)}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Day Selection ──
  if (!workoutActive) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-2xl font-bold">Training loggen</h1>
        {availableDays.length === 0 ? (
          <div className="rounded-xl bg-card py-8 text-center text-neutral-500">
            Kein aktiver Trainingsplan. Erstelle zuerst einen Plan.
          </div>
        ) : (
          <div className="rounded-xl bg-card p-4 space-y-4">
            <p className="text-sm text-neutral-500">Wähle den Trainingstag:</p>
            <div className="flex flex-wrap gap-2">
              {availableDays.map((d) => (
                <button key={d}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    dayLabel === d ? "bg-white text-black" : "bg-neutral-800 text-neutral-400"
                  }`}
                  onClick={() => setDayLabel(d)}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              onClick={startWorkout}
              disabled={!dayLabel}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-black transition-all disabled:opacity-30 active:scale-[0.98]"
            >
              <Play className="h-4 w-4" /> Workout starten
            </button>
          </div>
        )}

        {/* Workout History */}
        {history.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-neutral-400">Letzte Workouts</h2>
            {history.map((day) => (
              <div key={day.date} className="rounded-xl bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Calendar className="h-4 w-4 text-neutral-500" />
                  {new Date(day.date + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
                </div>
                {day.exercises.map((ex, i) => (
                  <div key={i} className="ml-6 text-xs text-neutral-400">
                    <span className="text-neutral-300">{ex.name}</span>
                    {" — "}
                    {ex.sets.map((s, j) => (
                      <span key={j}>
                        {s.weight_kg}kg×{s.reps}
                        {j < ex.sets.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Active Workout (Hevy-Style) ──
  const currentEx = exercises[currentExIdx];

  return (
    <div className="flex min-h-screen flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={goToPrevExercise} disabled={currentExIdx === 0}
          className="rounded-full bg-neutral-800 p-2 disabled:opacity-30">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-center">
          <span className="text-lg font-bold">{currentExIdx + 1}</span>
          <span className="text-neutral-500"> / {exercises.length}</span>
        </div>
        <button onClick={finishWorkout}
          className="rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium">
          Finish
        </button>
      </div>

      {/* Rest Timer - Large Display */}
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        {timerActive || restTimer > 0 ? (
          <>
            <p className="text-[5rem] font-bold leading-none tracking-tight tabular-nums">
              {String(Math.floor(restTimer / 60)).padStart(2, "0")}:{String(restTimer % 60).padStart(2, "0")}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {String(Math.floor(restDuration / 60)).padStart(2, "0")}:{String(restDuration % 60).padStart(2, "0")}
            </p>
            <div className="mt-6 flex items-center gap-8">
              <button onClick={() => adjustTimer(-15)} className="flex flex-col items-center gap-1">
                <div className="rounded-lg bg-neutral-800 p-3">
                  <Minus className="h-4 w-4" />
                </div>
                <span className="text-xs text-neutral-500">15s</span>
              </button>
              <button onClick={skipTimer}
                className="rounded-lg bg-neutral-800 px-6 py-3 text-sm font-medium">
                <SkipForward className="mx-auto h-5 w-5" />
              </button>
              <button onClick={() => adjustTimer(15)} className="flex flex-col items-center gap-1">
                <div className="rounded-lg bg-neutral-800 p-3">
                  <Plus className="h-4 w-4" />
                </div>
                <span className="text-xs text-neutral-500">15s</span>
              </button>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="text-xl font-bold text-neutral-300">{dayLabel}</p>
            <p className="text-sm text-neutral-600 mt-1">{completedSetsCount} / {totalSetsCount} Sets</p>
            {/* Progress bar */}
            <div className="mt-3 h-1 w-48 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-300"
                style={{ width: `${totalSetsCount > 0 ? (completedSetsCount / totalSetsCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Exercise Card - Bottom Sheet Style */}
      {currentEx && (
        <div className="rounded-t-3xl bg-neutral-900 px-4 pb-24 pt-4 space-y-3">
          {/* Drag handle */}
          <div className="flex justify-center">
            <div className="h-1 w-10 rounded-full bg-neutral-700" />
          </div>

          {/* Exercise name + previous */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <p className="font-semibold">{currentEx.name}</p>
              </div>
              <p className="ml-4 text-xs text-neutral-500">{currentEx.muscle_group}</p>
              {currentEx.previous_log && (
                <p className="ml-4 mt-1 text-xs text-neutral-600">
                  Vorher: {currentEx.previous_log.map((s) => `${s.weight_kg}kg ×${s.reps}`).join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* Sets */}
          <div className="space-y-2">
            {currentEx.sets_data.map((set, setIdx) => (
              <div key={setIdx} className="flex items-center gap-3">
                <Input type="number" step="0.5" placeholder="0"
                  className="w-20 bg-neutral-800 border-none text-center"
                  value={set.weight_kg || ""}
                  onChange={(e) => updateSet(currentExIdx, setIdx, "weight_kg", Number(e.target.value))}
                  disabled={currentEx.saved}
                />
                <span className="text-xs text-neutral-500">Kg</span>
                <Input type="number" placeholder="0"
                  className="w-16 bg-neutral-800 border-none text-center"
                  value={set.reps || ""}
                  onChange={(e) => updateSet(currentExIdx, setIdx, "reps", Number(e.target.value))}
                  disabled={currentEx.saved}
                />
                <span className="text-xs text-neutral-500">reps</span>
                <div className="ml-auto flex items-center gap-2">
                  {/* Remove set */}
                  {!currentEx.saved && currentEx.sets_data.length > 1 && (
                    <button onClick={() => removeSet(currentExIdx, setIdx)}
                      className="rounded p-1 text-neutral-600 active:text-red-400">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {/* Checkbox */}
                  <button
                    onClick={() => !currentEx.saved && toggleSetComplete(currentExIdx, setIdx)}
                    disabled={currentEx.saved}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border-2 transition-all ${
                      set.completed
                        ? "border-white bg-white"
                        : "border-neutral-600 bg-transparent"
                    } ${currentEx.saved ? "opacity-50" : ""}`}
                  >
                    {set.completed && <Check className="h-4 w-4 text-black" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom actions */}
          <div className="flex items-center gap-3 pt-1">
            {!currentEx.saved && (
              <button onClick={() => addSet(currentExIdx)}
                className="flex items-center gap-1 rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-400 active:scale-[0.97]">
                <Plus className="h-3 w-3" /> Set
              </button>
            )}
            <button
              onClick={() => {
                const input = prompt("Pausenzeit (Sekunden):", String(restDuration));
                if (input) setRestDuration(Math.max(0, Number(input)));
              }}
              className="flex items-center gap-1 rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-400 active:scale-[0.97]"
            >
              {String(Math.floor(restDuration / 60)).padStart(2, "0")}:{String(restDuration % 60).padStart(2, "0")}
            </button>
            {currentExIdx < exercises.length - 1 && (
              <button onClick={goToNextExercise}
                className="ml-auto rounded-lg bg-white px-4 py-2 text-xs font-semibold text-black active:scale-[0.97]">
                Nächste Übung →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
