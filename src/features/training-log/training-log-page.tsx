import { useState, useEffect, useCallback } from "react";
import { Play, ChevronLeft, Plus, Check, Trophy, Flame, X, SkipForward, Minus, Calendar, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { useWorkout } from "@/lib/workout-context";
import type { SetLog } from "@/types/database";

export function TrainingLogPage() {
  const workout = useWorkout();
  const [loading, setLoading] = useState(true);
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState("");
  const [history, setHistory] = useState<{ date: string; exercises: { id: string; name: string; sets: SetLog[] }[] }[]>([]);

  const totalSetsCount = workout.exercises.reduce((sum, ex) => sum + ex.sets_data.length, 0);
  const completedSetsCount = workout.exercises.reduce(
    (sum, ex) => sum + ex.sets_data.filter((s) => s.completed).length, 0
  );

  const fetchActivePlan = useCallback(async () => {
    const { data: plans } = await supabase
      .from("training_plans").select("id").eq("user_id", USER_ID).eq("is_active", true);
    if (!plans || plans.length === 0) { setLoading(false); return; }
    const planIds = plans.map((p) => p.id);
    const { data: exs } = await supabase
      .from("training_exercises").select("*").in("plan_id", planIds).order("order_index");
    if (exs) {
      setAvailableDays([...new Set((exs as { day_label: string }[]).map((e) => e.day_label))]);
    }

    const { data: logs } = await supabase
      .from("training_logs").select("id, date, sets_completed, training_exercises(name)")
      .eq("user_id", USER_ID).order("date", { ascending: false }).limit(50);
    if (logs) {
      const grouped = new Map<string, { id: string; name: string; sets: SetLog[] }[]>();
      for (const log of logs as unknown as { id: string; date: string; sets_completed: SetLog[]; training_exercises: { name: string } | null }[]) {
        const arr = grouped.get(log.date) ?? [];
        arr.push({ id: log.id, name: log.training_exercises?.name ?? "?", sets: log.sets_completed });
        grouped.set(log.date, arr);
      }
      setHistory(Array.from(grouped, ([date, exercises]) => ({ date, exercises })));
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchActivePlan(); }, [fetchActivePlan]);

  const deleteLog = async (logId: string) => {
    await supabase.from("training_logs").delete().eq("id", logId);
    setHistory((prev) =>
      prev.map((day) => ({ ...day, exercises: day.exercises.filter((ex) => ex.id !== logId) }))
        .filter((day) => day.exercises.length > 0)
    );
  };

  const handleStartWorkout = async () => {
    if (!selectedDay) return;
    await workout.startWorkout(selectedDay);
  };

  const handleCloseSummary = () => {
    workout.closeSummary();
    fetchActivePlan();
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;

  // ── Workout Summary ──
  if (workout.summary) {
    const summary = workout.summary;
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-b from-neutral-900 to-black p-4">
        <div className="flex justify-end">
          <button onClick={handleCloseSummary} className="rounded-full bg-neutral-800 p-2">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-6 py-8">
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
        <div className="space-y-2 px-2 pb-4">
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

  // ── Active Workout (Hevy-Style) ──
  if (workout.workoutActive) {
    const currentEx = workout.exercises[workout.currentExIdx];
    return (
      <div className="flex h-[100dvh] flex-col bg-black overflow-hidden">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <button onClick={workout.goToPrevExercise} disabled={workout.currentExIdx === 0}
            className="rounded-full bg-neutral-800 p-2 disabled:opacity-30">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <span className="text-lg font-bold">{workout.currentExIdx + 1}</span>
            <span className="text-neutral-500"> / {workout.exercises.length}</span>
          </div>
          <button onClick={workout.finishWorkout}
            className="rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium">
            Finish
          </button>
        </div>

        {/* Rest Timer - Large Display */}
        <div className="flex flex-1 flex-col items-center justify-center px-4">
          {workout.timerActive || workout.restTimer > 0 ? (
            <>
              <p className="text-[5rem] font-bold leading-none tracking-tight tabular-nums">
                {String(Math.floor(workout.restTimer / 60)).padStart(2, "0")}:{String(workout.restTimer % 60).padStart(2, "0")}
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {String(Math.floor(workout.restDuration / 60)).padStart(2, "0")}:{String(workout.restDuration % 60).padStart(2, "0")}
              </p>
              <div className="mt-6 flex items-center gap-8">
                <button onClick={() => workout.adjustTimer(-15)} className="flex flex-col items-center gap-1">
                  <div className="rounded-lg bg-neutral-800 p-3">
                    <Minus className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-neutral-500">15s</span>
                </button>
                <button onClick={workout.skipTimer}
                  className="rounded-lg bg-neutral-800 px-6 py-3 text-sm font-medium">
                  <SkipForward className="mx-auto h-5 w-5" />
                </button>
                <button onClick={() => workout.adjustTimer(15)} className="flex flex-col items-center gap-1">
                  <div className="rounded-lg bg-neutral-800 p-3">
                    <Plus className="h-4 w-4" />
                  </div>
                  <span className="text-xs text-neutral-500">15s</span>
                </button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <p className="text-xl font-bold text-neutral-300">{workout.dayLabel}</p>
              <p className="text-sm text-neutral-600 mt-1">{completedSetsCount} / {totalSetsCount} Sets</p>
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
          <div className="rounded-t-3xl bg-neutral-900 px-4 pb-4 pt-4 space-y-3 overflow-y-auto max-h-[55dvh]">
            <div className="flex justify-center">
              <div className="h-1 w-10 rounded-full bg-neutral-700" />
            </div>

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

            <div className="space-y-2">
              {currentEx.sets_data.map((set, setIdx) => (
                <div key={setIdx} className="flex items-center gap-3">
                  <Input type="number" step="0.5" placeholder="0"
                    className="w-20 bg-neutral-800 border-none text-center"
                    value={set.weight_kg || ""}
                    onChange={(e) => workout.updateSet(workout.currentExIdx, setIdx, "weight_kg", Number(e.target.value))}
                    disabled={currentEx.saved}
                  />
                  <span className="text-xs text-neutral-500">Kg</span>
                  <Input type="number" placeholder="0"
                    className="w-16 bg-neutral-800 border-none text-center"
                    value={set.reps || ""}
                    onChange={(e) => workout.updateSet(workout.currentExIdx, setIdx, "reps", Number(e.target.value))}
                    disabled={currentEx.saved}
                  />
                  <span className="text-xs text-neutral-500">reps</span>
                  <div className="ml-auto flex items-center gap-2">
                    {!currentEx.saved && currentEx.sets_data.length > 1 && (
                      <button onClick={() => workout.removeSet(workout.currentExIdx, setIdx)}
                        className="rounded p-1 text-neutral-600 active:text-red-400">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => !currentEx.saved && workout.toggleSetComplete(workout.currentExIdx, setIdx)}
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

            <div className="flex items-center gap-3 pt-1">
              {!currentEx.saved && (
                <button onClick={() => workout.addSet(workout.currentExIdx)}
                  className="flex items-center gap-1 rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-400 active:scale-[0.97]">
                  <Plus className="h-3 w-3" /> Set
                </button>
              )}
              <button
                onClick={() => {
                  const input = prompt("Pausenzeit (Sekunden):", String(workout.restDuration));
                  if (input) workout.setRestDuration(Math.max(0, Number(input)));
                }}
                className="flex items-center gap-1 rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-400 active:scale-[0.97]"
              >
                {String(Math.floor(workout.restDuration / 60)).padStart(2, "0")}:{String(workout.restDuration % 60).padStart(2, "0")}
              </button>
              {workout.currentExIdx < workout.exercises.length - 1 && (
                <button onClick={workout.goToNextExercise}
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

  // ── Day Selection ──
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
                  selectedDay === d ? "bg-white text-black" : "bg-neutral-800 text-neutral-400"
                }`}
                onClick={() => setSelectedDay(d)}
              >
                {d}
              </button>
            ))}
          </div>
          <button
            onClick={handleStartWorkout}
            disabled={!selectedDay}
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
              {day.exercises.map((ex) => (
                <div key={ex.id} className="ml-6 flex items-center gap-2 text-xs text-neutral-400">
                  <div className="flex-1">
                    <span className="text-neutral-300">{ex.name}</span>
                    {" — "}
                    {ex.sets.map((s, j) => (
                      <span key={j}>
                        {s.weight_kg}kg×{s.reps}
                        {j < ex.sets.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                  <button onClick={() => deleteLog(ex.id)} className="shrink-0 text-neutral-700 hover:text-red-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
