import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Activity, Heart, Clock, MapPin, Flame, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getCardioActivities, syncStravaActivities, getStravaStatus } from "@/lib/strava-service";
import type { CardioActivity } from "@/types/database";
import { cn } from "@/lib/utils";

const activityIcons: Record<string, string> = {
  run: "\u{1F3C3}", ride: "\u{1F6B4}", swim: "\u{1F3CA}", walk: "\u{1F6B6}",
  hike: "\u{1F97E}", weight_training: "\u{1F3CB}", workout: "\u{1F4AA}",
  yoga: "\u{1F9D8}", crossfit: "\u{1F3CB}", rowing: "\u{1F6A3}",
};

const activityLabels: Record<string, string> = {
  run: "Laufen", ride: "Radfahren", swim: "Schwimmen", walk: "Gehen",
  hike: "Wandern", weight_training: "Krafttraining", workout: "Workout",
  yoga: "Yoga", crossfit: "CrossFit", rowing: "Rudern",
};

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function groupByDate(activities: CardioActivity[]): { label: string; items: CardioActivity[] }[] {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups = new Map<string, CardioActivity[]>();

  for (const a of activities) {
    const dateStr = new Date(a.start_date).toDateString();
    const list = groups.get(dateStr) ?? [];
    list.push(a);
    groups.set(dateStr, list);
  }

  return Array.from(groups.entries()).map(([dateStr, items]) => {
    let label: string;
    if (dateStr === today) label = "Heute";
    else if (dateStr === yesterday) label = "Gestern";
    else label = new Date(dateStr).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
    return { label, items };
  });
}

export function AusdauerPage() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<CardioActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);

  const fetchData = useCallback(async () => {
    const [acts, status] = await Promise.all([
      getCardioActivities(50),
      getStravaStatus(),
    ]);
    setActivities(acts as CardioActivity[]);
    setStravaConnected(status.connected);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncStravaActivities();
      await fetchData();
    } finally {
      setSyncing(false);
    }
  };

  // Weekly stats
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekActivities = activities.filter((a) => new Date(a.start_date) >= weekStart);
  const weekDistance = weekActivities.reduce((s, a) => s + (a.distance_m ?? 0), 0);
  const weekDuration = weekActivities.reduce((s, a) => s + (a.moving_time_sec ?? 0), 0);
  const weekCalories = weekActivities.reduce((s, a) => s + (a.calories ?? 0), 0);
  const weekAvgHr = weekActivities.filter((a) => a.avg_heartrate).length > 0
    ? Math.round(weekActivities.reduce((s, a) => s + (a.avg_heartrate ?? 0), 0) / weekActivities.filter((a) => a.avg_heartrate).length)
    : null;

  const grouped = groupByDate(activities);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ausdauer</h1>
        <div className="flex gap-2">
          {stravaConnected && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-2 text-xs font-medium active:scale-[0.97]"
            >
              <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
              {syncing ? "Sync..." : "Sync"}
            </button>
          )}
          {!stravaConnected && (
            <button
              onClick={() => navigate("/einstellungen")}
              className="flex items-center gap-1.5 rounded-lg bg-[#FC4C02] px-3 py-2 text-xs font-semibold text-white active:scale-[0.97]"
            >
              Strava verbinden
            </button>
          )}
        </div>
      </div>

      {/* Weekly summary */}
      {weekActivities.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs font-medium text-neutral-500 mb-3">Diese Woche</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-400" />
              <div>
                <p className="text-sm font-bold">{formatDistance(weekDistance)}</p>
                <p className="text-[10px] text-neutral-500">Distanz</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-sm font-bold">{formatDuration(weekDuration)}</p>
                <p className="text-[10px] text-neutral-500">Dauer</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-400" />
              <div>
                <p className="text-sm font-bold">{weekCalories.toLocaleString("de-DE")} kcal</p>
                <p className="text-[10px] text-neutral-500">Kalorien</p>
              </div>
            </div>
            {weekAvgHr && (
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-red-400" />
                <div>
                  <p className="text-sm font-bold">{weekAvgHr} bpm</p>
                  <p className="text-[10px] text-neutral-500">Herzfrequenz</p>
                </div>
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] text-neutral-600">{weekActivities.length} Aktivitäten</p>
        </div>
      )}

      {/* Activity list */}
      {activities.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-card py-12 text-center">
          <Activity className="h-12 w-12 text-neutral-600" />
          <div>
            <p className="text-sm text-neutral-400">Keine Aktivitäten</p>
            <p className="text-xs text-neutral-600 mt-1">
              {stravaConnected ? "Tippe auf Sync um Strava-Aktivitäten zu laden" : "Verbinde Strava in den Einstellungen"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">{group.label}</p>
              <div className="space-y-2">
                {group.items.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl bg-card p-3">
                    <span className="text-lg">{activityIcons[a.activity_type] ?? "\u{1F3C3}"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.name ?? activityLabels[a.activity_type] ?? a.activity_type}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                        {a.distance_m != null && a.distance_m > 0 && (
                          <span>{formatDistance(a.distance_m)}</span>
                        )}
                        {a.moving_time_sec != null && (
                          <span>{formatDuration(a.moving_time_sec)}</span>
                        )}
                        {a.avg_heartrate != null && (
                          <span className="text-red-400">{a.avg_heartrate} bpm</span>
                        )}
                        {a.avg_pace_sec_per_km != null && a.activity_type === "run" && (
                          <span>{formatPace(a.avg_pace_sec_per_km)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] text-neutral-600 capitalize">{a.source}</span>
                      {a.calories != null && a.calories > 0 && (
                        <span className="text-[10px] text-neutral-600">{a.calories} kcal</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings link */}
      <button
        onClick={() => navigate("/einstellungen")}
        className="flex w-full items-center justify-between rounded-xl bg-card p-4 text-sm text-neutral-400 active:scale-[0.98]"
      >
        <span>Verbindungen verwalten</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
