import { useState, useMemo } from "react";
import { Trophy, TrendingDown, TrendingUp } from "lucide-react";
import type { CardioActivity } from "@/types/database";
import { formatDuration, formatPace, formatDistance, getWeekStart, getDayOfWeek } from "./ausdauer-utils";

type Period = "week" | "month" | "year";

const PERIOD_LABELS: Record<Period, string> = { week: "Woche", month: "Monat", year: "Jahr" };

function filterByPeriod(activities: CardioActivity[], period: Period): CardioActivity[] {
  const now = new Date();
  let start: Date;
  if (period === "week") {
    start = getWeekStart(now);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
  }
  return activities.filter((a) => new Date(a.start_date) >= start);
}

function groupByBucket(activities: CardioActivity[], period: Period): { label: string; km: number }[] {
  const now = new Date();
  if (period === "week") {
    const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    const result = days.map((label) => ({ label, km: 0 }));
    const ws = getWeekStart(now);
    for (const a of activities) {
      const d = new Date(a.start_date);
      if (d >= ws) {
        result[getDayOfWeek(d)].km += (a.distance_m ?? 0) / 1000;
      }
    }
    return result;
  } else if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const weeks: { label: string; km: number }[] = [];
    for (let w = 0; w < 5; w++) {
      weeks.push({ label: `W${w + 1}`, km: 0 });
    }
    for (const a of activities) {
      const d = new Date(a.start_date);
      if (d >= start) {
        const weekIdx = Math.min(4, Math.floor((d.getDate() - 1) / 7));
        weeks[weekIdx].km += (a.distance_m ?? 0) / 1000;
      }
    }
    return weeks;
  } else {
    const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const result = months.map((label) => ({ label, km: 0 }));
    for (const a of activities) {
      const d = new Date(a.start_date);
      if (d.getFullYear() === now.getFullYear()) {
        result[d.getMonth()].km += (a.distance_m ?? 0) / 1000;
      }
    }
    return result;
  }
}

function BarChart({ data, accentColor }: { data: { label: string; km: number }[]; accentColor: string }) {
  const max = Math.max(...data.map((d) => d.km), 0.1);
  const barW = 100 / data.length;

  return (
    <div className="mt-2">
      <svg viewBox="0 0 100 40" className="w-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const h = (d.km / max) * 32;
          return (
            <rect
              key={i}
              x={i * barW + barW * 0.15}
              y={38 - h}
              width={barW * 0.7}
              height={Math.max(h, 0.5)}
              rx="1"
              fill={d.km > 0 ? accentColor : "#333"}
              opacity={d.km > 0 ? 0.85 : 0.3}
            />
          );
        })}
      </svg>
      <div className="flex justify-between px-0.5">
        {data.map((d, i) => (
          <span key={i} className="text-[8px] text-neutral-600" style={{ width: `${barW}%`, textAlign: "center" }}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

function PaceTrendChart({ activities }: { activities: CardioActivity[] }) {
  const runs = activities
    .filter((a) => a.activity_type === "run" && a.avg_pace_sec_per_km != null)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  if (runs.length < 2) return null;

  const paces = runs.map((r) => r.avg_pace_sec_per_km!);
  const min = Math.min(...paces);
  const max = Math.max(...paces);
  const range = max - min || 1;
  const w = 100, h = 40;

  const points = paces.map((p, i) => {
    const x = (i / (paces.length - 1)) * w;
    const y = h - 4 - ((p - min) / range) * (h - 8);
    return `${x},${y}`;
  }).join(" ");

  const improving = paces[paces.length - 1] < paces[0];

  return (
    <div className="rounded-xl bg-[#1A1A1A] p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-neutral-400">Pace-Entwicklung</p>
        <span className={`flex items-center gap-1 text-[10px] font-medium ${improving ? "text-green-400" : "text-red-400"}`}>
          {improving ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
          {improving ? "Schneller" : "Langsamer"}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="#A855F7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between mt-1 text-[9px] text-neutral-600">
        <span>{formatPace(paces[0])} /km</span>
        <span>{formatPace(paces[paces.length - 1])} /km</span>
      </div>
    </div>
  );
}

function DayHeatmap({ activities }: { activities: CardioActivity[] }) {
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const counts = Array(7).fill(0);
  for (const a of activities) {
    counts[getDayOfWeek(new Date(a.start_date))]++;
  }
  const max = Math.max(...counts, 1);

  return (
    <div className="rounded-xl bg-[#1A1A1A] p-4">
      <p className="text-xs font-medium text-neutral-400 mb-3">Trainingstage</p>
      <div className="flex gap-1.5">
        {days.map((day, i) => (
          <div key={day} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full aspect-square rounded-md"
              style={{
                backgroundColor: counts[i] > 0
                  ? `rgba(252, 76, 2, ${0.2 + (counts[i] / max) * 0.7})`
                  : "#222",
              }}
            />
            <span className="text-[9px] text-neutral-600">{day}</span>
            {counts[i] > 0 && <span className="text-[9px] text-neutral-500">{counts[i]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabStats({ activities }: { activities: CardioActivity[] }) {
  const [period, setPeriod] = useState<Period>("week");

  const filtered = useMemo(() => filterByPeriod(activities, period), [activities, period]);
  const chartData = useMemo(() => groupByBucket(activities, period), [activities, period]);

  // Single-pass totals
  const { totalDist, totalTime, totalElev } = useMemo(() => {
    let dist = 0, time = 0, elev = 0;
    for (const a of filtered) {
      dist += a.distance_m ?? 0;
      time += a.moving_time_sec ?? 0;
      elev += a.elevation_gain_m ?? 0;
    }
    return { totalDist: dist, totalTime: time, totalElev: elev };
  }, [filtered]);

  // Personal records (all time, stable across period changes)
  const { fastestKm, longestRun } = useMemo(() => {
    const allRuns = activities.filter((a) => a.activity_type === "run");
    return {
      fastestKm: allRuns.filter((a) => a.avg_pace_sec_per_km != null).reduce((best, a) => (a.avg_pace_sec_per_km! < (best?.avg_pace_sec_per_km ?? Infinity) ? a : best), null as CardioActivity | null),
      longestRun: allRuns.reduce((best, a) => ((a.distance_m ?? 0) > (best?.distance_m ?? 0) ? a : best), null as CardioActivity | null),
    };
  }, [activities]);

  return (
    <div className="space-y-3">
      {/* Period toggle */}
      <div className="flex rounded-lg bg-neutral-900 p-1">
        {(["week", "month", "year"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${period === p ? "bg-neutral-700 text-white" : "text-neutral-500"}`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[#1A1A1A] p-3 text-center">
          <p className="text-lg font-bold">{(totalDist / 1000).toFixed(1)}</p>
          <p className="text-[10px] text-neutral-500">km</p>
        </div>
        <div className="rounded-xl bg-[#1A1A1A] p-3 text-center">
          <p className="text-lg font-bold">{formatDuration(totalTime)}</p>
          <p className="text-[10px] text-neutral-500">Dauer</p>
        </div>
        <div className="rounded-xl bg-[#1A1A1A] p-3 text-center">
          <p className="text-lg font-bold">{Math.round(totalElev)}</p>
          <p className="text-[10px] text-neutral-500">Hm</p>
        </div>
      </div>

      <div className="rounded-xl bg-[#1A1A1A] p-4">
        <p className="text-xs font-medium text-neutral-400">Distanz</p>
        <BarChart data={chartData} accentColor="#FC4C02" />
      </div>

      <PaceTrendChart activities={filtered} />
      <DayHeatmap activities={activities} />

      {(fastestKm || longestRun) && (
        <div className="rounded-xl bg-[#1A1A1A] p-4">
          <p className="text-xs font-medium text-neutral-400 mb-3 flex items-center gap-1.5">
            <Trophy className="h-3 w-3 text-amber-400" /> Persönliche Rekorde
          </p>
          <div className="space-y-2">
            {fastestKm && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Schnellster Pace</span>
                <span className="font-bold">{formatPace(fastestKm.avg_pace_sec_per_km!)} /km</span>
              </div>
            )}
            {longestRun && longestRun.distance_m != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Längster Lauf</span>
                <span className="font-bold">{formatDistance(longestRun.distance_m)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
