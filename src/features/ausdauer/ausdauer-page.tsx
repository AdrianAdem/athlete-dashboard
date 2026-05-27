import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw, Activity, Clock, MapPin, Flame, Mountain, Gauge, Heart, Link2, Play, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCardioActivities, syncStravaActivities, getStravaStatus } from "@/lib/strava-service";
import type { CardioActivity } from "@/types/database";
import { cn } from "@/lib/utils";

const activityLabels: Record<string, string> = {
  run: "Laufen", ride: "Radfahren", swim: "Schwimmen", walk: "Gehen",
  hike: "Wandern", weight_training: "Krafttraining", workout: "Workout",
  yoga: "Yoga", crossfit: "CrossFit", rowing: "Rudern",
};

const activityIcons: Record<string, string> = {
  run: "\u{1F3C3}", ride: "\u{1F6B4}", swim: "\u{1F3CA}", walk: "\u{1F6B6}",
  hike: "\u{1F97E}", weight_training: "\u{1F3CB}", workout: "\u{1F4AA}",
  yoga: "\u{1F9D8}", crossfit: "\u{1F3CB}", rowing: "\u{1F6A3}",
};

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
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

// Leaflet map that only initializes when scrolled into view
function LazyRouteMap({ polyline, onClick }: { polyline: string; onClick: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !initialized.current) {
          initialized.current = true;
          const coords = decodePolyline(polyline);
          if (coords.length < 2) return;

          const map = L.map(el, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false,
            keyboard: false,
          });

          L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            maxZoom: 19,
          }).addTo(map);

          const line = L.polyline(coords, {
            color: "oklch(0.75 0.18 30)",
            weight: 3,
            opacity: 0.9,
          }).addTo(map);

          map.fitBounds(line.getBounds(), { padding: [24, 24] });

          // Start/end markers
          L.circleMarker(coords[0], { radius: 4, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1, weight: 0 }).addTo(map);
          L.circleMarker(coords[coords.length - 1], { radius: 4, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1, weight: 0 }).addTo(map);

          mapRef.current = map;
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => { observer.disconnect(); mapRef.current?.remove(); };
  }, [polyline]);

  return (
    <div className="relative h-[200px] w-full overflow-hidden">
      <div
        ref={containerRef}
        onClick={onClick}
        className="absolute inset-0 cursor-pointer bg-neutral-900"
      />
    </div>
  );
}

// Feed card for a single activity
function ActivityCard({ activity, onClick }: { activity: CardioActivity; onClick: () => void }) {
  const raw = activity.raw_data ?? {};
  const polyline = (raw.map as { summary_polyline?: string })?.summary_polyline;
  const dateStr = new Date(activity.start_date);
  const icon = activityIcons[activity.activity_type] ?? "\u{1F3C3}";
  const label = activityLabels[activity.activity_type] ?? activity.activity_type;

  return (
    <div className="rounded-2xl bg-[#1A1A1A] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3" onClick={onClick}>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-base">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{activity.name ?? label}</p>
          <p className="text-[11px] text-neutral-500">
            {dateStr.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
            {" · "}
            {dateStr.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
          </p>
        </div>
        <span className="text-[10px] text-neutral-600 uppercase tracking-wide">{activity.source}</span>
      </div>

      {/* Map */}
      {polyline ? (
        <LazyRouteMap polyline={polyline} onClick={onClick} />
      ) : (
        <div
          onClick={onClick}
          className="flex h-[120px] items-center justify-center bg-neutral-800/40 cursor-pointer"
        >
          <span className="text-4xl opacity-30">{icon}</span>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto" onClick={onClick}>
        {activity.distance_m != null && activity.distance_m > 0 && (
          <StatPill icon={<MapPin className="h-3 w-3 text-blue-400" />} value={formatDistance(activity.distance_m)} />
        )}
        {activity.avg_pace_sec_per_km != null && activity.activity_type === "run" && (
          <StatPill icon={<Gauge className="h-3 w-3 text-purple-400" />} value={`${formatPace(activity.avg_pace_sec_per_km)} /km`} />
        )}
        {activity.avg_speed_ms != null && activity.activity_type !== "run" && activity.avg_speed_ms > 0 && (
          <StatPill icon={<Gauge className="h-3 w-3 text-purple-400" />} value={`${(activity.avg_speed_ms * 3.6).toFixed(1)} km/h`} />
        )}
        {activity.moving_time_sec != null && (
          <StatPill icon={<Clock className="h-3 w-3 text-green-400" />} value={formatDuration(activity.moving_time_sec)} />
        )}
        {activity.elevation_gain_m != null && activity.elevation_gain_m > 0 && (
          <StatPill icon={<Mountain className="h-3 w-3 text-amber-400" />} value={`${Math.round(activity.elevation_gain_m)} m`} />
        )}
        {activity.avg_heartrate != null && (
          <StatPill icon={<Heart className="h-3 w-3 text-red-400" />} value={`${activity.avg_heartrate} bpm`} />
        )}
        {activity.calories != null && activity.calories > 0 && (
          <StatPill icon={<Flame className="h-3 w-3 text-orange-400" />} value={`${activity.calories} kcal`} />
        )}
      </div>
    </div>
  );
}

function StatPill({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-neutral-800/70 px-2.5 py-1 text-[11px] font-medium text-neutral-300 whitespace-nowrap shrink-0">
      {icon}{value}
    </span>
  );
}

const ACTIVITY_TYPES = [
  { key: "run", label: "Laufen", icon: "\u{1F3C3}" },
  { key: "ride", label: "Radfahren", icon: "\u{1F6B4}" },
  { key: "walk", label: "Gehen", icon: "\u{1F6B6}" },
  { key: "hike", label: "Wandern", icon: "\u{1F97E}" },
];

export function AusdauerPage() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<CardioActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [showStartMenu, setShowStartMenu] = useState(false);

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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ausdauer</h1>
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

      {/* Weekly summary */}
      {weekActivities.length > 0 && (
        <div className="flex items-center gap-4 rounded-xl bg-[#1A1A1A] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Woche</p>
          <span className="text-xs font-bold">{formatDistance(weekDistance)}</span>
          <span className="text-xs text-neutral-400">{formatDuration(weekDuration)}</span>
          {weekCalories > 0 && <span className="text-xs text-neutral-500">{weekCalories} kcal</span>}
          <span className="text-[10px] text-neutral-600 ml-auto">{weekActivities.length} Aktivitäten</span>
        </div>
      )}

      {/* Empty: not connected */}
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

      {/* Empty: connected, no activities */}
      {stravaConnected && activities.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-[#1A1A1A] py-12 text-center">
          <Activity className="h-12 w-12 text-neutral-600" />
          <div>
            <p className="text-sm text-neutral-400">Keine Aktivitäten</p>
            <p className="text-xs text-neutral-600 mt-1">Tippe auf Sync um Strava-Aktivitäten zu laden</p>
          </div>
        </div>
      )}

      {/* Feed */}
      {activities.length > 0 && (
        <div className="space-y-4">
          {activities.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              onClick={() => navigate(`/ausdauer/${a.id}`)}
            />
          ))}
        </div>
      )}

      {/* FAB: Start Training */}
      <button
        onClick={() => setShowStartMenu(true)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FC4C02] shadow-lg shadow-[#FC4C02]/30 active:scale-90 transition-transform"
      >
        <Play className="h-6 w-6 text-white ml-0.5" />
      </button>

      {/* Activity type picker overlay */}
      {showStartMenu && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowStartMenu(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-neutral-900 p-5 pb-8 safe-area-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold">Training starten</h3>
              <button onClick={() => setShowStartMenu(false)} className="rounded-lg bg-neutral-800 p-1.5 active:scale-95">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ACTIVITY_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => navigate(`/ausdauer/training?type=${t.key}`)}
                  className="flex items-center gap-3 rounded-xl bg-neutral-800 p-4 active:scale-[0.97] transition-transform"
                >
                  <span className="text-2xl">{t.icon}</span>
                  <span className="text-sm font-semibold">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
