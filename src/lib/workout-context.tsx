import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { toLocalDateString } from "@/lib/utils";
import type { TrainingExercise, SetLog } from "@/types/database";

interface WorkoutSet extends SetLog {
  completed: boolean;
}

interface WorkoutExercise extends TrainingExercise {
  sets_data: WorkoutSet[];
  previous_log: SetLog[] | null;
  /** Heaviest weight ever logged for this exercise; PRs compare against it, not just the last session. Optional: workouts restored from older storage lack it. */
  best_weight?: number;
  /**
   * Id of this session's training_logs row, generated up front. Saving is an
   * upsert on it, so a retry after a lost response (or after iOS killed the
   * app mid-request) overwrites the same row instead of adding a second one.
   */
  log_id: string;
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
  saveError: string | null;
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
  saveExercise: (exIdx: number) => Promise<boolean>;
  goToNextExercise: () => void;
  goToPrevExercise: () => void;
  /** Saves every exercise; resolves false (and keeps the workout) on failure. */
  finishWorkout: () => Promise<boolean>;
  closeSummary: () => void;
}

const WorkoutContext = createContext<WorkoutContextType | null>(null);

export function useWorkout() {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error("useWorkout must be used within WorkoutProvider");
  return ctx;
}

const DEFAULT_REST = 180;

// iOS kills a backgrounded PWA freely (switching to music or the camera during
// a rest is enough). The running workout is mirrored here so it survives that.
const STORAGE_KEY = "active_workout_v1";

interface StoredWorkout {
  exercises: WorkoutExercise[];
  currentExIdx: number;
  dayLabel: string;
  restDuration: number;
  startedAt: string;
}

function loadStoredWorkout(): StoredWorkout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredWorkout;
    const valid =
      Array.isArray(stored.exercises) &&
      stored.exercises.length > 0 &&
      !Number.isNaN(new Date(stored.startedAt).getTime()) &&
      Number.isInteger(stored.currentExIdx) &&
      stored.currentExIdx >= 0 &&
      stored.currentExIdx < stored.exercises.length &&
      stored.exercises.every(
        (ex) =>
          typeof ex?.id === "string" && Array.isArray(ex.sets_data) && ex.sets_data.length > 0,
      );
    if (!valid) throw new Error("unusable stored workout");
    // Entries saved before log_id was generated up front get one now.
    stored.exercises = stored.exercises.map((ex) => ({
      ...ex,
      log_id: ex.log_id || crypto.randomUUID(),
    }));
    return stored;
  } catch {
    // Corrupt or from an older shape: drop it. Without this a bad entry
    // crashed the training page on every load, with no way for the user to
    // clear it on a phone.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
    return null;
  }
}

function completedSets(ex: WorkoutExercise): SetLog[] {
  return ex.sets_data.filter((s) => s.completed).map(({ completed: _, ...s }) => s);
}

export function WorkoutProvider({ children }: { children: ReactNode }) {
  const [restored] = useState(loadStoredWorkout);
  const [workoutActive, setWorkoutActive] = useState(!!restored);
  const [exercises, setExercises] = useState<WorkoutExercise[]>(restored?.exercises ?? []);
  const [currentExIdx, setCurrentExIdx] = useState(restored?.currentExIdx ?? 0);
  const [dayLabel, setDayLabel] = useState(restored?.dayLabel ?? "");
  const [restTimer, setRestTimer] = useState(0);
  const [restDuration, setRestDuration] = useState(restored?.restDuration ?? DEFAULT_REST);
  const [timerActive, setTimerActive] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(
    restored ? new Date(restored.startedAt) : null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const restEndTime = useRef<number>(0);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);

  // Always-current view of the exercises for async save chains, which would
  // otherwise act on the state captured when they were scheduled.
  const exercisesRef = useRef(exercises);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  // One save chain per exercise: a second save waits for the first, so a quick
  // "Weiter" followed by "Beenden" can no longer insert the same log twice.
  const saveChains = useRef(new Map<string, Promise<boolean>>());

  useEffect(() => {
    if (!workoutActive || !startedAt) return;
    try {
      const stored: StoredWorkout = {
        exercises,
        currentExIdx,
        dayLabel,
        restDuration,
        startedAt: startedAt.toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Storage full or blocked: the workout still runs, it just cannot be
      // restored after a reload.
    }
  }, [workoutActive, exercises, currentExIdx, dayLabel, restDuration, startedAt]);

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

  // restDuration is the single source: it starts at the exercise's own rest
  // time on every exercise change, and a manual adjustment overrides it.
  const startRestTimer = useCallback(() => {
    restEndTime.current = Date.now() + restDuration * 1000;
    setRestTimer(restDuration);
    setTimerActive(true);
  }, [restDuration]);

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
    setSaveError(null);
    const { data: plans } = await supabase
      .from("training_plans")
      .select("id")
      .eq("user_id", USER_ID)
      .eq("is_active", true);
    if (!plans || plans.length === 0) return;
    const planIds = plans.map((p) => p.id);
    const { data: exs } = await supabase
      .from("training_exercises")
      .select("*")
      .in("plan_id", planIds)
      .eq("day_label", day)
      .eq("is_active", true)
      .order("order_index");
    if (!exs) return;

    // One query for all exercises. On error best_weight stays undefined, so the
    // PR check falls back to the last session instead of inventing a record.
    const bestByExercise = new Map<string, number>();
    // Paged (API caps a response at 1000 rows), newest first so a cap only
    // drops the oldest history.
    const histLogs: { exercise_id: string; sets_completed: unknown }[] = [];
    let histFailed = (exs as TrainingExercise[]).length === 0;
    for (let from = 0; !histFailed && from < 5000; from += 1000) {
      const { data: page, error: pageError } = await supabase
        .from("training_logs")
        .select("exercise_id, sets_completed")
        .eq("user_id", USER_ID)
        .in(
          "exercise_id",
          (exs as TrainingExercise[]).map((e) => e.id),
        )
        .order("date", { ascending: false })
        .range(from, from + 999);
      if (pageError || !page) {
        histFailed = true;
        break;
      }
      histLogs.push(...page);
      if (page.length < 1000) break;
    }
    if (!histFailed) {
      for (const l of histLogs) {
        const id = l.exercise_id;
        const sets = (l.sets_completed as SetLog[] | null) ?? [];
        const max = Math.max(0, ...sets.map((x) => x.weight_kg).filter(Number.isFinite));
        bestByExercise.set(id, Math.max(bestByExercise.get(id) ?? 0, max));
      }
      for (const e of exs as TrainingExercise[]) {
        if (!bestByExercise.has(e.id)) bestByExercise.set(e.id, 0);
      }
    }

    const exercisesWithPrev: WorkoutExercise[] = await Promise.all(
      (exs as TrainingExercise[]).map(async (ex) => {
        const { data: prevLog } = await supabase
          .from("training_logs")
          .select("sets_completed")
          .eq("exercise_id", ex.id)
          .eq("user_id", USER_ID)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle();
        const prevSets = prevLog ? (prevLog.sets_completed as SetLog[]) : null;
        const bestWeight = bestByExercise.get(ex.id);
        return {
          ...ex,
          sets_data: Array.from({ length: ex.sets }, (_, i) => ({
            set: i + 1,
            weight_kg: prevSets?.[i]?.weight_kg ?? 0,
            reps: prevSets?.[i]?.reps ?? ex.reps,
            completed: false,
          })),
          previous_log: prevSets,
          best_weight: bestWeight,
          log_id: crypto.randomUUID(),
        };
      }),
    );
    saveChains.current.clear();
    setExercises(exercisesWithPrev);
    setCurrentExIdx(0);
    setRestDuration(exercisesWithPrev[0]?.rest_seconds ?? DEFAULT_REST);
    setDayLabel(day);
    setStartedAt(new Date());
    setWorkoutActive(true);
  }, []);

  const updateSet = useCallback(
    (exIdx: number, setIdx: number, field: "weight_kg" | "reps", value: number) => {
      setExercises((prev) =>
        prev.map((ex, i) =>
          i === exIdx
            ? {
                ...ex,
                sets_data: ex.sets_data.map((s, j) =>
                  j === setIdx ? { ...s, [field]: value } : s,
                ),
              }
            : ex,
        ),
      );
    },
    [],
  );

  const toggleSetComplete = useCallback(
    (exIdx: number, setIdx: number) => {
      const set = exercisesRef.current[exIdx]?.sets_data[setIdx];
      if (set && !set.completed) startRestTimer();
      setExercises((prev) =>
        prev.map((ex, i) =>
          i === exIdx
            ? {
                ...ex,
                sets_data: ex.sets_data.map((s, j) =>
                  j === setIdx ? { ...s, completed: !s.completed } : s,
                ),
              }
            : ex,
        ),
      );
    },
    [startRestTimer],
  );

  const addSet = useCallback((exIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const lastSet = ex.sets_data[ex.sets_data.length - 1];
        return {
          ...ex,
          sets_data: [
            ...ex.sets_data,
            {
              set: ex.sets_data.length + 1,
              weight_kg: lastSet?.weight_kg ?? 0,
              reps: lastSet?.reps ?? ex.reps,
              completed: false,
            },
          ],
        };
      }),
    );
  }, []);

  const removeSet = useCallback((exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx || ex.sets_data.length <= 1) return ex;
        return {
          ...ex,
          sets_data: ex.sets_data
            .filter((_, j) => j !== setIdx)
            .map((s, j) => ({ ...s, set: j + 1 })),
        };
      }),
    );
  }, []);

  const startedAtRef = useRef(startedAt);
  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);

  // Writes the exercise's completed sets as an upsert on the pre-generated
  // log id: idempotent, so retries and a quick "next" + "finish" cannot create
  // duplicates, and sets added after an earlier save are kept. Un-ticking
  // every set removes the row again.
  const persistExercise = useCallback((exerciseId: string): Promise<boolean> => {
    const previous = saveChains.current.get(exerciseId) ?? Promise.resolve(true);
    const next = previous.then(async () => {
      const ex = exercisesRef.current.find((e) => e.id === exerciseId);
      if (!ex) return true;
      const sets = completedSets(ex);

      if (sets.length === 0) {
        // Always delete: a no-op when nothing was saved, and correct for a row
        // saved before the app was killed and restored (an in-memory "was
        // saved" flag would not survive that).
        const { error } = await supabase.from("training_logs").delete().eq("id", ex.log_id);
        return !error;
      }

      const { error } = await supabase.from("training_logs").upsert(
        {
          id: ex.log_id,
          exercise_id: ex.id,
          user_id: USER_ID,
          // The day the workout started, not "now": a session that runs past
          // midnight or is restored the next day stays on its own day.
          date: toLocalDateString(startedAtRef.current ?? new Date()),
          sets_completed: sets,
        },
        { onConflict: "id" },
      );
      return !error;
    });
    saveChains.current.set(exerciseId, next);
    return next;
  }, []);

  const saveExercise = useCallback(
    async (exIdx: number) => {
      const ex = exercisesRef.current[exIdx];
      if (!ex) return true;
      const ok = await persistExercise(ex.id);
      // A later success clears the banner of an earlier failure.
      setSaveError(
        ok ? null : "Übung konnte nicht gespeichert werden. Wird beim Beenden erneut versucht.",
      );
      return ok;
    },
    [persistExercise],
  );

  const goToNextExercise = useCallback(() => {
    const current = exercisesRef.current[currentExIdx];
    if (current && current.sets_data.some((s) => s.completed)) {
      void saveExercise(currentExIdx);
    }
    if (currentExIdx < exercisesRef.current.length - 1) {
      const nextIdx = currentExIdx + 1;
      setCurrentExIdx(nextIdx);
      setRestDuration(exercisesRef.current[nextIdx]?.rest_seconds ?? DEFAULT_REST);
    }
  }, [currentExIdx, saveExercise]);

  const goToPrevExercise = useCallback(() => {
    if (currentExIdx > 0) {
      const prevIdx = currentExIdx - 1;
      setCurrentExIdx(prevIdx);
      setRestDuration(exercisesRef.current[prevIdx]?.rest_seconds ?? DEFAULT_REST);
    }
  }, [currentExIdx]);

  const finishWorkout = useCallback(async () => {
    setSaveError(null);
    const all = exercisesRef.current;
    const results = await Promise.all(all.map((ex) => persistExercise(ex.id)));
    if (results.some((ok) => !ok)) {
      // Keep everything in place so nothing is lost; the user can retry.
      setSaveError("Speichern fehlgeschlagen. Verbindung prüfen und erneut beenden.");
      return false;
    }

    const duration = startedAt ? Math.round((Date.now() - startedAt.getTime()) / 60000) : 0;
    let totalSets = 0;
    let totalWeight = 0;
    let records = 0;

    const exSummaries = all.map((ex) => {
      const done = ex.sets_data.filter((s) => s.completed);
      totalSets += done.length;
      totalWeight += done.reduce((s, set) => s + set.weight_kg * set.reps, 0);

      const currentMax = Math.max(...done.map((s) => s.weight_kg), 0);
      const lastMax = ex.previous_log ? Math.max(...ex.previous_log.map((s) => s.weight_kg), 0) : 0;
      const prevMax = Math.max(lastMax, ex.best_weight ?? 0);
      const isPR = prevMax > 0 && currentMax > prevMax;
      const improvement = prevMax > 0 ? ((currentMax - prevMax) / prevMax) * 100 : 0;
      if (isPR) records++;

      return { name: ex.name, muscle_group: ex.muscle_group, isPR, improvement };
    });

    setSummary({
      dayLabel,
      totalSets,
      totalWeightKg: Math.round(totalWeight),
      durationMin: duration,
      exercises: exSummaries,
      records,
    });
    skipTimer();
    setWorkoutActive(false);
    setExercises([]);
    setDayLabel("");
    setStartedAt(null);
    saveChains.current.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    return true;
  }, [dayLabel, startedAt, skipTimer, persistExercise]);

  const closeSummary = useCallback(() => {
    setSummary(null);
  }, []);

  // Memoised so consumers do not re-render on unrelated provider renders.
  // The rest timer is part of the value and still ticks every second.
  const value = useMemo<WorkoutContextType>(
    () => ({
      workoutActive,
      exercises,
      currentExIdx,
      restTimer,
      restDuration,
      timerActive,
      summary,
      dayLabel,
      workoutStartTime: startedAt,
      saveError,
      setExercises,
      setCurrentExIdx,
      setRestDuration,
      setDayLabel,
      startWorkout,
      updateSet,
      toggleSetComplete,
      addSet,
      removeSet,
      startRestTimer,
      skipTimer,
      adjustTimer,
      saveExercise,
      goToNextExercise,
      goToPrevExercise,
      finishWorkout,
      closeSummary,
    }),
    [
      workoutActive,
      exercises,
      currentExIdx,
      restTimer,
      restDuration,
      timerActive,
      summary,
      dayLabel,
      startedAt,
      saveError,
      startWorkout,
      updateSet,
      toggleSetComplete,
      addSet,
      removeSet,
      startRestTimer,
      skipTimer,
      adjustTimer,
      saveExercise,
      goToNextExercise,
      goToPrevExercise,
      finishWorkout,
      closeSummary,
    ],
  );

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
}
