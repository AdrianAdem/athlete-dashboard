import { useState, useEffect } from "react";
import {
  Heart, Moon, Activity, Footprints,
  Battery, Wind,
} from "lucide-react";
import { getGarminData } from "@/lib/garmin-service";
import type { GarminHealthData } from "@/lib/garmin-service";
import { cn } from "@/lib/utils";

function dateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

export function GarminHealthCard() {
  const [health, setHealth] = useState<GarminHealthData | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        // Data is pushed by the local sync script; show the most recent day
        // that actually has daily metrics (today is often still incomplete).
        const entries = await getGarminData(dateStr(7), dateStr(0));
        const sorted = entries.sort((a, b) => b.date.localeCompare(a.date));
        // "daily" can exist with all-null values on a day the watch hasn't
        // synced yet — require an actual measurement.
        const latest = sorted.find((e) => {
          const daily = e.data?.daily;
          return daily && (daily.steps != null || daily.resting_hr != null);
        }) ?? sorted[0];
        if (latest) setHealth(latest.data);
      } catch {
        // No data yet or fetch failed
      }
      setChecked(true);
    };
    load();
  }, []);

  // Don't render until checked; hide if no data has been synced yet
  if (!checked || !health) return null;

  const d = health?.daily;
  const s = health?.sleep;
  const hrv = health?.hrv;
  const vo2 = health?.vo2max;

  // Sleep duration in hours:minutes
  const sleepDur = s?.duration_sec
    ? `${Math.floor(s.duration_sec / 3600)}h ${Math.round((s.duration_sec % 3600) / 60)}m`
    : null;

  // Body battery range
  const bbRange = d?.body_battery_low != null && d?.body_battery_high != null
    ? `${d.body_battery_low}–${d.body_battery_high}`
    : null;

  // Stress level label
  const stressLabel = (avg: number | null | undefined) => {
    if (avg == null) return null;
    if (avg < 26) return "Ruhig";
    if (avg < 51) return "Niedrig";
    if (avg < 76) return "Mittel";
    return "Hoch";
  };

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-bold">Gesundheit</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
          {/* Resting HR */}
          <MetricTile
            icon={<Heart className="h-4 w-4 text-red-400" />}
            label="Ruhepuls"
            value={d?.resting_hr != null ? `${d.resting_hr}` : "—"}
            unit="bpm"
          />

          {/* Sleep */}
          <MetricTile
            icon={<Moon className="h-4 w-4 text-indigo-400" />}
            label="Schlaf"
            value={sleepDur ?? "—"}
            sub={s?.score != null ? `Score: ${s.score}` : undefined}
          />

          {/* HRV */}
          <MetricTile
            icon={<Activity className="h-4 w-4 text-emerald-400" />}
            label="HRV"
            value={hrv?.last_night != null ? `${Math.round(hrv.last_night)}` : "—"}
            unit="ms"
            sub={hrv?.status ?? undefined}
          />

          {/* VO2max */}
          <MetricTile
            icon={<Wind className="h-4 w-4 text-cyan-400" />}
            label="VO2max"
            value={vo2?.generic != null ? `${vo2.generic.toFixed(1)}` : "—"}
            sub={vo2?.fitness_age != null ? `Fitness-Alter: ${vo2.fitness_age}` : undefined}
          />

          {/* Steps */}
          <MetricTile
            icon={<Footprints className="h-4 w-4 text-amber-400" />}
            label="Schritte"
            value={d?.steps != null ? d.steps.toLocaleString("de-DE") : "—"}
            sub={d?.floors_climbed != null ? `${d.floors_climbed} Stockwerke` : undefined}
          />

          {/* Body Battery */}
          <MetricTile
            icon={<Battery className="h-4 w-4 text-green-400" />}
            label="Body Battery"
            value={bbRange ?? "—"}
            sub={stressLabel(d?.avg_stress) != null ? `Stress: ${stressLabel(d?.avg_stress)}` : undefined}
          />

          {/* Sleep breakdown — full width */}
          {s?.deep_sec != null && (
            <div className="col-span-2 rounded-xl bg-card p-3">
              <p className="mb-2 text-xs font-medium text-neutral-500">Schlafphasen</p>
              <SleepBar sleep={s} />
            </div>
          )}
      </div>
    </div>
  );
}

function MetricTile({ icon, label, value, unit, sub }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-card p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] text-neutral-500">{label}</span>
      </div>
      <p className="text-lg font-bold leading-tight">
        {value}
        {unit && <span className="ml-0.5 text-xs font-normal text-neutral-500">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-neutral-500">{sub}</p>}
    </div>
  );
}

function SleepBar({ sleep }: { sleep: NonNullable<GarminHealthData["sleep"]> }) {
  const total = (sleep.deep_sec ?? 0) + (sleep.light_sec ?? 0) + (sleep.rem_sec ?? 0) + (sleep.awake_sec ?? 0);
  if (total === 0) return null;

  const phases = [
    { label: "Tief", sec: sleep.deep_sec ?? 0, color: "bg-indigo-600" },
    { label: "Leicht", sec: sleep.light_sec ?? 0, color: "bg-indigo-400" },
    { label: "REM", sec: sleep.rem_sec ?? 0, color: "bg-cyan-400" },
    { label: "Wach", sec: sleep.awake_sec ?? 0, color: "bg-neutral-600" },
  ];

  const fmtMin = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-3 overflow-hidden rounded-full">
        {phases.map((p) => (
          <div
            key={p.label}
            className={cn("transition-all", p.color)}
            style={{ width: `${(p.sec / total) * 100}%` }}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {phases.map((p) => (
          <div key={p.label} className="flex items-center gap-1">
            <div className={cn("h-2 w-2 rounded-full", p.color)} />
            <span className="text-[10px] text-neutral-500">{p.label} {fmtMin(p.sec)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
