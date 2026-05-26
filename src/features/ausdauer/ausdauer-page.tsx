import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Activity, Heart, Clock, MapPin, Flame, ChevronRight, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getCardioActivities, syncStravaActivities, getStravaStatus } from "@/lib/strava-service";
import type { CardioActivity } from "@/types/database";
import { cn } from "@/lib/utils";

// Decode Google encoded polyline to [lat, lng][]
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let idx = 0, lat = 0, lng = 0;
  while (idx < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

function PolylineThumbnail({ polyline }: { polyline: string }) {
  const coords = decodePolyline(polyline);
  if (coords.length < 2) return <span className="flex h-10 w-10 items-center justify-center text-lg">{"\u{1F3C3}"}</span>;

  const lats = coords.map((c) => c[0]);
  const lngs = coords.map((c) => c[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const rangeLat = maxLat - minLat || 0.001;
  const rangeLng = maxLng - minLng || 0.001;

  const size = 40;
  const pad = 3;
  const inner = size - pad * 2;
  const points = coords.map((c) => {
    const x = pad + ((c[1] - minLng) / rangeLng) * inner;
    const y = pad + (1 - (c[0] - minLat) / rangeLat) * inner;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-lg bg-neutral-800/60">
      <polyline points={points} fill="none" stroke="oklch(0.75 0.18 30)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

      {/* Empty state: not connected */}
      {!stravaConnected && activities.length === 0 && (
        <div className="flex flex-col items-center gap-6 py-20 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#FC4C02]/15">
            <span className="text-4xl font-black text-[#FC4C02]">S</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Mit Strava verbinden</h2>
            <p className="text-sm text-neutral-500 max-w-[260px]">
              Verbinde dein Strava-Konto um Lauf-, Rad- und Schwimmaktivitäten automatisch zu synchronisieren.
            </p>
          </div>
          <button
            onClick={() => navigate("/einstellungen")}
            className="flex items-center gap-2 rounded-xl bg-[#FC4C02] px-6 py-3 text-sm font-bold text-white active:scale-[0.97] transition-transform"
          >
            <Link2 className="h-4 w-4" />
            Verbinden
          </button>
        </div>
      )}

      {/* Empty state: connected but no activities */}
      {stravaConnected && activities.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-card py-12 text-center">
          <Activity className="h-12 w-12 text-neutral-600" />
          <div>
            <p className="text-sm text-neutral-400">Keine Aktivitäten</p>
            <p className="text-xs text-neutral-600 mt-1">Tippe auf Sync um Strava-Aktivitäten zu laden</p>
          </div>
        </div>
      )}

      {/* Activity list */}
      {activities.length > 0 && (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">{group.label}</p>
              <div className="space-y-2">
                {group.items.map((a) => (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/ausdauer/${a.id}`)}
                    className="flex items-center gap-3 rounded-xl bg-card p-3 cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <div className="shrink-0">
                      {(a.raw_data?.map as { summary_polyline?: string })?.summary_polyline ? (
                        <PolylineThumbnail polyline={(a.raw_data!.map as { summary_polyline: string }).summary_polyline} />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center text-lg">{activityIcons[a.activity_type] ?? "\u{1F3C3}"}</span>
                      )}
                    </div>
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
                        {a.elevation_gain_m != null && a.elevation_gain_m > 0 && (
                          <span className="text-amber-500">{Math.round(a.elevation_gain_m)}m ↑</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {a.calories != null && a.calories > 0 && (
                        <span className="text-[10px] text-neutral-600">{a.calories} kcal</span>
                      )}
                      <ChevronRight className="h-3 w-3 text-neutral-700" />
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
