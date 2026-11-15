import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import { TrendingUp, Activity, Zap, BarChart3, ChevronDown, Search, X } from "lucide-react";
import type { TrainingLog, TrainingExercise, SetLog } from "@/types/database";
import { toLocalDateString } from "@/lib/utils";

function ExerciseDropdown({
  exercises,
  selectedId,
  onSelect,
}: {
  exercises: TrainingExercise[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = exercises.find((e) => e.id === selectedId);
  const filtered = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.muscle_group.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div ref={ref} className="relative mb-3">
      <button
        onClick={() => {
          setOpen(!open);
          setSearch("");
        }}
        className="flex w-full items-center justify-between rounded-xl bg-neutral-800 px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-medium">{selected ? selected.name : "Übung auswählen"}</p>
          {selected && <p className="text-xs text-neutral-500">{selected.muscle_group}</p>}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-hidden rounded-xl bg-neutral-800 shadow-xl">
          <div className="flex items-center gap-2 border-b border-neutral-700 px-3 py-2">
            <Search className="h-4 w-4 text-neutral-500" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Übung suchen..."
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <X className="h-3 w-3 text-neutral-500" />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-neutral-500">Keine Übungen gefunden</p>
            ) : (
              filtered.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => {
                    onSelect(ex.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors ${
                    selectedId === ex.id ? "bg-neutral-700" : "hover:bg-neutral-700/50"
                  }`}
                >
                  <div>
                    <p className="text-sm">{ex.name}</p>
                    <p className="text-xs text-neutral-500">{ex.muscle_group}</p>
                  </div>
                  {selectedId === ex.id && <div className="h-2 w-2 rounded-full bg-white" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreRing({
  value,
  maxValue,
  label,
  icon,
  color,
}: {
  value: number;
  maxValue: number;
  label: string;
  icon: React.ReactNode;
  color: string;
}) {
  const size = 72;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / maxValue, 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#262626"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-lg font-bold">{value.toFixed(1)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-[10px] text-neutral-500">{label}</span>
      </div>
    </div>
  );
}

export function SportStatsPage() {
  const [weeklyVolume, setWeeklyVolume] = useState<{ week: string; sets: number }[]>([]);
  const [exercises, setExercises] = useState<TrainingExercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [strengthData, setStrengthData] = useState<
    { date: string; maxWeight: number; estimated1RM: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<"1W" | "1M" | "1Y" | "All">("1M");
  const [metricTab, setMetricTab] = useState<"1RM" | "Max Weight" | "Volume" | "Total Reps">("1RM");
  const [insightTab, setInsightTab] = useState<"global" | "exercises">("global");

  // Training calendar
  const [trainingDays, setTrainingDays] = useState<Set<string>>(new Set());
  const [weekStreak, setWeekStreak] = useState(0);

  // Insight scores
  const [scores, setScores] = useState({ progress: 0, consistency: 0, intensity: 0, volume: 0 });

  const getDaysBack = () => {
    switch (timeRange) {
      case "1W":
        return 7;
      case "1M":
        return 30;
      case "1Y":
        return 365;
      case "All":
        return 9999;
    }
  };

  const fetchStats = useCallback(async () => {
    const daysBack = getDaysBack();
    const since = new Date();
    since.setDate(since.getDate() - daysBack);
    const sinceStr = toLocalDateString(since);

    // Fetch all logs for time range
    const { data: logs } = await supabase
      .from("training_logs")
      .select("*, training_exercises(name, muscle_group)")
      .eq("user_id", USER_ID)
      .gte("date", sinceStr)
      .order("date");

    // Fetch all logs for calendar (last 90 days always)
    const calSince = new Date();
    calSince.setDate(calSince.getDate() - 90);
    const { data: calLogs } = await supabase
      .from("training_logs")
      .select("date")
      .eq("user_id", USER_ID)
      .gte("date", toLocalDateString(calSince));

    if (calLogs) {
      const days = new Set(calLogs.map((l) => l.date as string));
      setTrainingDays(days);

      // Calculate week streak
      let streak = 0;
      const now = new Date();
      for (let w = 0; w < 52; w++) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + 1 - w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        let hasTraining = false;
        for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
          if (days.has(toLocalDateString(d))) {
            hasTraining = true;
            break;
          }
        }
        if (hasTraining) streak++;
        else break;
      }
      setWeekStreak(streak);
    }

    if (logs) {
      const typedLogs = logs as (TrainingLog & {
        training_exercises: { name: string; muscle_group: string };
      })[];

      // Weekly volume
      const weekMap = new Map<string, number>();
      typedLogs.forEach((log) => {
        const d = new Date(log.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay() + 1);
        const key = toLocalDateString(weekStart);
        const totalSets = (log.sets_completed as SetLog[]).length;
        weekMap.set(key, (weekMap.get(key) ?? 0) + totalSets);
      });
      setWeeklyVolume(
        Array.from(weekMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([week, sets]) => ({
            week: new Date(week).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
            sets,
          })),
      );

      // Calculate insight scores
      const totalSets = typedLogs.reduce((s, l) => s + (l.sets_completed as SetLog[]).length, 0);
      const uniqueDays = new Set(typedLogs.map((l) => l.date)).size;
      const avgWeightPerSet =
        typedLogs.reduce((s, l) => {
          const sets = l.sets_completed as SetLog[];
          return s + sets.reduce((ss, set) => ss + set.weight_kg, 0);
        }, 0) / Math.max(totalSets, 1);

      setScores({
        progress: Math.min(totalSets / 50, 10),
        consistency: Math.min((uniqueDays / Math.max(daysBack / 7, 1)) * 2.5, 10),
        intensity: Math.min(avgWeightPerSet / 15, 10),
        volume: Math.min(totalSets / 30, 10),
      });
    }

    // Fetch exercises for strength chart
    const { data: activePlans } = await supabase
      .from("training_plans")
      .select("id")
      .eq("user_id", USER_ID)
      .eq("is_active", true);

    if (activePlans && activePlans.length > 0) {
      const planIds = activePlans.map((p) => p.id);
      const { data: exs } = await supabase
        .from("training_exercises")
        .select("*")
        .in("plan_id", planIds);
      if (exs) {
        setExercises(exs as TrainingExercise[]);
        if (exs.length > 0 && !selectedExercise) {
          fetchExerciseStrength(exs[0].id);
        }
      }
    }

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const fetchExerciseStrength = async (exerciseId: string) => {
    setSelectedExercise(exerciseId);
    const { data: logs } = await supabase
      .from("training_logs")
      .select("*")
      .eq("exercise_id", exerciseId)
      .eq("user_id", USER_ID)
      .order("date");

    if (logs) {
      setStrengthData(
        (logs as TrainingLog[]).map((log) => {
          const sets = log.sets_completed as SetLog[];
          const maxWeight = Math.max(...sets.map((s) => s.weight_kg), 0);
          const bestSet = sets.reduce(
            (best, s) => (s.weight_kg > best.weight_kg ? s : best),
            sets[0] ?? { weight_kg: 0, reps: 0 },
          );
          // Brzycki formula for estimated 1RM
          const e1rm =
            bestSet && bestSet.reps > 0
              ? Math.round(bestSet.weight_kg * (36 / (37 - bestSet.reps)))
              : maxWeight;
          return {
            date: new Date(log.date).toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "2-digit",
            }),
            maxWeight,
            estimated1RM: e1rm,
          };
        }),
      );
    }
  };

  const selectedEx = exercises.find((e) => e.id === selectedExercise);
  const improvement =
    strengthData.length >= 2
      ? ((strengthData[strengthData.length - 1].estimated1RM - strengthData[0].estimated1RM) /
          Math.max(strengthData[0].estimated1RM, 1)) *
        100
      : 0;
  const latestValue =
    strengthData.length > 0
      ? metricTab === "1RM"
        ? strengthData[strengthData.length - 1].estimated1RM
        : strengthData[strengthData.length - 1].maxWeight
      : 0;

  // Calendar rendering
  type CalDay = { date: Date; hasTraining: boolean } | null;
  const renderCalendar = () => {
    const weeks: CalDay[][] = [];
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - 84); // 12 weeks
    start.setDate(start.getDate() - start.getDay() + 1); // Monday

    let currentWeek: CalDay[] = [];
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      const dateStr = toLocalDateString(d);
      currentWeek.push({ date: new Date(d), hasTraining: trainingDays.has(dateStr) });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    // Pad the trailing partial week so its cells stay aligned under the 7-column
    // grid (flex-1 would otherwise spread fewer cells across the full width).
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return weeks;
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>
    );

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-bold">Statistiken</h1>

      {/* Insight Scores */}
      <div className="rounded-xl bg-card p-4">
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setInsightTab("global")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              insightTab === "global" ? "bg-white text-black" : "text-neutral-500"
            }`}
          >
            Global
          </button>
          <button
            onClick={() => setInsightTab("exercises")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              insightTab === "exercises" ? "bg-white text-black" : "text-neutral-500"
            }`}
          >
            Übungen
          </button>
        </div>
        {insightTab === "global" ? (
          <div className="flex justify-around">
            <ScoreRing
              value={scores.progress}
              maxValue={10}
              label="Progress"
              color="#ffffff"
              icon={<TrendingUp className="h-3 w-3 text-neutral-500" />}
            />
            <ScoreRing
              value={scores.consistency}
              maxValue={10}
              label="Consistency"
              color="#ffffff"
              icon={<Activity className="h-3 w-3 text-neutral-500" />}
            />
            <ScoreRing
              value={scores.intensity}
              maxValue={10}
              label="Intensity"
              color="#ffffff"
              icon={<Zap className="h-3 w-3 text-neutral-500" />}
            />
            <ScoreRing
              value={scores.volume}
              maxValue={10}
              label="Volume"
              color="#ffffff"
              icon={<BarChart3 className="h-3 w-3 text-neutral-500" />}
            />
          </div>
        ) : (
          <div>
            {exercises.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-500">Keine Übungen</p>
            ) : (
              <>
                <ExerciseDropdown
                  exercises={exercises}
                  selectedId={selectedExercise}
                  onSelect={fetchExerciseStrength}
                />
                {selectedExercise && strengthData.length > 0 && (
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold">
                      {strengthData[strengthData.length - 1].estimated1RM}
                    </span>
                    <span className="text-sm text-neutral-500">kg 1RM</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Time range selector */}
      <div className="flex gap-2">
        {(["1W", "1M", "1Y", "All"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              timeRange === r ? "bg-white text-black" : "text-neutral-500"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Volume chart */}
      <div className="rounded-xl bg-card p-4">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold">
            {weeklyVolume.reduce((s, w) => s + w.sets, 0).toLocaleString()}
          </span>
          <span className="text-sm text-neutral-500">sets</span>
        </div>
        {weeklyVolume.length > 0 ? (
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={weeklyVolume}>
              <XAxis
                dataKey="week"
                tick={{ fontSize: 9, fill: "#737373" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="sets" fill="#ffffff" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-neutral-500">Keine Daten</p>
        )}
      </div>

      {/* Strength chart */}
      <div className="rounded-xl bg-card p-4">
        <ExerciseDropdown
          exercises={exercises}
          selectedId={selectedExercise}
          onSelect={fetchExerciseStrength}
        />

        {selectedEx && (
          <>
            <div className="mb-1">
              <p className="text-sm font-semibold">{selectedEx.name}</p>
              <p className="text-xs text-neutral-500">{selectedEx.muscle_group}</p>
            </div>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold">{latestValue}</span>
              <span className="text-sm text-neutral-500">Kg</span>
              {improvement !== 0 && (
                <span
                  className={`text-sm font-medium ${improvement > 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {improvement > 0 ? "▲" : "▼"} {Math.abs(improvement).toFixed(2)}%
                </span>
              )}
            </div>

            {/* Metric tabs */}
            <div className="mb-3 flex gap-3">
              {(["1RM", "Max Weight", "Volume", "Total Reps"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMetricTab(tab)}
                  className={`text-xs font-medium ${metricTab === tab ? "text-white" : "text-neutral-600"}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </>
        )}

        {strengthData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={strengthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: "#737373" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 9, fill: "#737373" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey={metricTab === "1RM" ? "estimated1RM" : "maxWeight"}
                stroke="#ffffff"
                strokeWidth={2}
                dot={{ fill: "#ffffff", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : selectedExercise ? (
          <p className="py-8 text-center text-sm text-neutral-500">Keine Logs</p>
        ) : null}
      </div>

      {/* Training Calendar */}
      <div className="rounded-xl bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Trainingskalender</h3>
          <div className="rounded-lg bg-neutral-800 px-3 py-1">
            <span className="text-lg font-bold">{weekStreak}</span>
            <span className="ml-1 text-xs text-neutral-500">week streak</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="mb-1 flex gap-1 text-[9px] text-neutral-600">
            {["M", "D", "M", "D", "F", "S", "S"].map((d, i) => (
              <div key={i} className="flex-1 text-center">
                {d}
              </div>
            ))}
          </div>
          {renderCalendar().map((week, wi) => (
            <div key={wi} className="flex gap-1">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="flex-1" />;
                const isToday = toLocalDateString(day.date) === toLocalDateString(new Date());
                return (
                  <div key={di} className="flex flex-1 items-center justify-center">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        day.hasTraining ? "bg-white" : isToday ? "bg-red-500" : "bg-neutral-800"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
