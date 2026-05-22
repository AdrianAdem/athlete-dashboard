import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { todayString } from "@/lib/utils";
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

interface WorkoutContextType {
  workoutActive: boolean;
  exercises: WorkoutExercise[];
  currentExIdx: number;
  restTimer: number;
  restDuration: number;
  timerActive: boolean;
  summary: WorkoutSummary | null;
  dayLabel: string;
  workoutStartTime: Date | null;
  setExercises: React.Dispatch<React.SetStateAction<WorkoutExercise[]>>;
  setCurrentExIdx: React.Dispatch<React.SetStateAction<number>>;
  setRestDuration: React.Dispatch<React.SetStateAction<number>>;
  setDayLabel: React.Dispatch<React.SetStateAction<string>>;
  startWorkout: (day: string) => Promise<void>;
  updateSet: (exIdx: number, setIdx: number, field: "weight_kg" | "reps", value: number) => void;
  toggleSetComplete: (exIdx: number, setIdx: number) => void;
  addSet: (exIdx: number) => void;
  removeSet: (exIdx: number, setIdx: number) => void;
  startRestTimer: () => void;
  skipTimer: () => void;
  adjustTimer: (delta: number) => void;
  saveExercise: (exIdx: number) => Promise<void>;
  goToNextExercise: () => void;
  goToPrevExercise: () => void;
  finishWorkout: () => Promise<void>;
  closeSummary: () => void;
}

const WorkoutContext = createContext<WorkoutContextType | null>(null);

export function useWorkout() {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error("useWorkout must be used within WorkoutProvider");
  return ctx;
}

const DEFAULT_REST = 180;

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [workoutActive, setWorkoutActive] = useState(false);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [dayLabel, setDayLabel] = useState("");
  const [restTimer, setRestTimer] = useState(0);
  const [restDuration, setRestDuration] = useState(DEFAULT_REST);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const restEndTime = useRef<number>(0);
  const workoutStart = useRef<Date | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);

  useEffect(() => {
    if (!timerActive) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((restEndTime.current - Date.now()) / 1000));
      setRestTimer(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setTimerActive(false);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  const startRestTimer = useCallback(() => {
    const ex = exercises[currentExIdx];
    const duration = ex?.rest_seconds ?? restDuration;
    restEndTime.current = Date.now() + duration * 1000;
    setRestTimer(duration);
    setTimerActive(true);
  }, [restDuration, exercises, currentExIdx]);

  const skipTimer = useCallback(() => {
    clearInterval(timerRef.current);
    restEndTime.current = 0;
    setRestTimer(0);
    setTimerActive(false);
  }, []);

  const adjustTimer = useCallback((delta: number) => {
    restEndTime.current = restEndTime.current + delta * 1000;
    setRestTimer((prev) => Math.max(0, prev + delta));
  }, []);

  const startWorkout = useCallback(async (day: string) => {
    const { data: plans } = await supabase
      .from("training_plans").select("id").eq("user_id", USER_ID).eq("is_active", true);
    if (!plans || plans.length === 0) return;
    const planIds = plans.map((p) => p.id);
    const { data: exs } = await supabase
      .from("training_exercises").select("*").in("plan_id", planIds).eq("day_label", day).order("order_index");
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
    if (exercisesWithPrev[0]?.rest_seconds) {
      setRestDuration(exercisesWithPrev[0].rest_seconds);
    } else {
      setRestDuration(DEFAULT_REST);
    }
    setDayLabel(day);
    setWorkoutActive(true);
    workoutStart.current = new Date();
  }, []);

  const updateSet = useCallback((exIdx: number, setIdx: number, field: "weight_kg" | "reps", value: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => i === exIdx
        ? { ...ex, sets_data: ex.sets_data.map((s, j) => j === setIdx ? { ...s, [field]: value } : s) }
        : ex
      )
    );
  }, []);

  const toggleSetComplete = useCallback((exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const newSets = ex.sets_data.map((s, j) => {
          if (j !== setIdx) return s;
          const nowCompleted = !s.completed;
          if (nowCompleted) startRestTimer();
          return { ...s, completed: nowCompleted };
        });
        return { ...ex, sets_data: newSets };
      })
    );
  }, [startRestTimer]);

  const addSet = useCallback((exIdx: number) => {
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
  }, []);

  const removeSet = useCallback((exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx || ex.sets_data.length <= 1) return ex;
        return {
          ...ex,
          sets_data: ex.sets_data.filter((_, j) => j !== setIdx).map((s, j) => ({ ...s, set: j + 1 })),
        };
      })
    );
  }, []);

  const saveExercise = useCallback(async (exIdx: number) => {
    const ex = exercises[exIdx];
    const completedSets = ex.sets_data.filter((s) => s.completed);
    if (completedSets.length === 0) return;

    await supabase.from("training_logs").insert({
      exercise_id: ex.id, user_id: USER_ID, date: todayString(),
      sets_completed: completedSets.map(({ completed: _, ...s }) => s),
    });
    setExercises((prev) => prev.map((e, i) => (i === exIdx ? { ...e, saved: true } : e)));
  }, [exercises]);

  const goToNextExercise = useCallback(() => {
    const current = exercises[currentExIdx];
    if (current && !current.saved && current.sets_data.every((s) => s.completed)) {
      saveExercise(currentExIdx);
    }
    if (currentExIdx < exercises.length - 1) {
      const nextIdx = currentExIdx + 1;
      setCurrentExIdx(nextIdx);
      const nextEx = exercises[nextIdx];
      if (nextEx?.rest_seconds) setRestDuration(nextEx.rest_seconds);
    }
  }, [exercises, currentExIdx, saveExercise]);

  const goToPrevExercise = useCallback(() => {
    if (currentExIdx > 0) {
      const prevIdx = currentExIdx - 1;
      setCurrentExIdx(prevIdx);
      const prevEx = exercises[prevIdx];
      if (prevEx?.rest_seconds) setRestDuration(prevEx.rest_seconds);
    }
  }, [currentExIdx, exercises]);

  const finishWorkout = useCallback(async () => {
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      if (!ex.saved && ex.sets_data.some((s) => s.completed)) {
        await supabase.from("training_logs").insert({
          exercise_id: ex.id, user_id: USER_ID, date: todayString(),
          sets_completed: ex.sets_data.filter((s) => s.completed).map(({ completed: _, ...s }) => s),
        });
      }
    }

    const duration = workoutStart.current
      ? Math.round((Date.now() - workoutStart.current.getTime()) / 60000)
      : 0;

    let totalSets = 0;
    let totalWeight = 0;
    let records = 0;

    const exSummaries = exercises.map((ex) => {
      const completed = ex.sets_data.filter((s) => s.completed);
      totalSets += completed.length;
      totalWeight += completed.reduce((s, set) => s + set.weight_kg * set.reps, 0);

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
  }, [exercises, dayLabel, skipTimer]);

  const closeSummary = useCallback(() => {
    setSummary(null);
  }, []);

  return (
    <WorkoutContext.Provider value={{
      workoutActive, exercises, currentExIdx, restTimer, restDuration,
      timerActive, summary, dayLabel, workoutStartTime: workoutStart.current,
      setExercises, setCurrentExIdx, setRestDuration, setDayLabel,
      startWorkout, updateSet, toggleSetComplete, addSet, removeSet,
      startRestTimer, skipTimer, adjustTimer, saveExercise,
      goToNextExercise, goToPrevExercise, finishWorkout, closeSummary,
    }}>
      {children}
    </WorkoutContext.Provider>
  );
}
