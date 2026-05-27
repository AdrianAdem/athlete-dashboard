import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { RefreshCw, Activity, Clock, MapPin, Flame, Mountain, Gauge, Heart, Link2, Play, X, Trophy, TrendingUp, TrendingDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCardioActivities, syncStravaActivities, getStravaStatus } from "@/lib/strava-service";
import type { CardioActivity } from "@/types/database";
import { cn } from "@/lib/utils";
import {
  activityLabels, activityIcons, activityAccent, decodePolyline,
  formatDuration, formatPace, formatDistance,
  getWeekStart, getPrevWeekStart, getDayOfWeek,
  groupByWeek, computeBadges, getPolyline, CARTO_DARK_TILES,
} from "./ausdauer-utils";
import { TabStats } from "./tab-stats";
import { TabGoals } from "./tab-goals";
import { TabRoutes } from "./tab-routes";

type SubTab = "feed" | "statistiken" | "ziele" | "routen";

// ── Week Dashboard (always visible) ──────────────────────────────
function WeekDashboard({ activities }: { activities: CardioActivity[] }) {
  const ws = getWeekStart(new Date());
  const pws = getPrevWeekStart(new Date());
  const pwe = new Date(pws); pwe.setDate(pwe.getDate() + 7);

  const thisWeek = activities.filter((a) => new Date(a.start_date) >= ws);
  const prevWeek = activities.filter((a) => { const d = new Date(a.start_date); return d >= pws && d < pwe; });

  const weekKm = thisWeek.reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000;
  const prevKm = prevWeek.reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000;
  const weekTime = thisWeek.reduce((s, a) => s + (a.moving_time_sec ?? 0), 0);
  const weekCount = thisWeek.length;

  const runs = thisWeek.filter((a) => a.activity_type === "run" && a.avg_pace_sec_per_km != null);
  const avgPace = runs.length > 0
    ? runs.reduce((s, a) => s + a.avg_pace_sec_per_km!, 0) / runs.length
    : null;

  const diff = weekKm - prevKm;

  // Daily km bars (Mo-So)
  const dailyKm = Array(7).fill(0);
  for (const a of thisWeek) {
    const idx = getDayOfWeek(new Date(a.start_date));
    dailyKm[idx] += (a.distance_m ?? 0) / 1000;
  }
  const maxDay = Math.max(...dailyKm, 0.1);
  const days = ["M", "D", "M", "D", "F", "S", "S"];
  const today = getDayOfWeek(new Date());

  return (
    <div className="rounded-2xl bg-[#1A1A1A] p-4 space-y-3">
      {/* Big km number */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-black tabular-nums">{weekKm.toFixed(1)} <span className="text-base font-semibold text-neutral-500">km</span></p>
          <p className="text-[10px] text-neutral-500 mt-0.5">Diese Woche</p>
        </div>
        {prevKm > 0 && (
          <span className={cn("flex items-center gap-0.5 text-[11px] font-medium", diff >= 0 ? "text-green-400" : "text-red-400")}>
            {diff >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {diff >= 0 ? "+" : ""}{diff.toFixed(1)} km
          </span>
        )}
      </div>

      {/* Secondary stats */}
      <div className="flex gap-4 text-xs">
        <span className="text-neutral-400"><Clock className="inline h-3 w-3 mr-1 text-green-400" />{formatDuration(weekTime)}</span>
        <span className="text-neutral-400">{weekCount} Aktivität{weekCount !== 1 ? "en" : ""}</span>
        {avgPace && <span className="text-neutral-400"><Gauge className="inline h-3 w-3 mr-1 text-purple-400" />{formatPace(avgPace)} /km</span>}
      </div>

      {/* Daily bar chart */}
      <div className="flex items-end gap-1 h-8">
        {dailyKm.map((km, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max((km / maxDay) * 24, km > 0 ? 3 : 1)}px`,
                backgroundColor: i === today ? "#FC4C02" : km > 0 ? "rgba(252,76,2,0.4)" : "#222",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {days.map((d, i) => (
          <span key={i} className={cn("flex-1 text-center text-[8px]", i === today ? "text-neutral-300 font-bold" : "text-neutral-600")}>{d}</span>
        ))}
      </div>
    </div>
  );
}

// ── Leaflet map with gradient route ──────────────────────────────
function LazyRouteMap({ polyline, accentColor, onClick }: { polyline: string; accentColor: string; onClick: () => void }) {
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
            zoomControl: false, attributionControl: false,
            dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, touchZoom: false, keyboard: false,
          });

          L.tileLayer(CARTO_DARK_TILES, { maxZoom: 19 }).addTo(map);

          // Gradient segments
          const segCount = Math.min(coords.length - 1, 20);
          const step = Math.max(1, Math.floor(coords.length / segCount));
          for (let i = 0; i < coords.length - 1; i += step) {
            const end = Math.min(i + step + 1, coords.length);
            const t = i / (coords.length - 1);
            L.polyline(coords.slice(i, end), {
              color: t < 0.5 ? accentColor : "#E879A0",
              weight: 3.5,
              opacity: 0.6 + t * 0.35,
            }).addTo(map);
          }

          // Glow
          L.polyline(coords, { color: accentColor, weight: 8, opacity: 0.15 }).addTo(map);

          map.fitBounds(L.latLngBounds(coords), { padding: [28, 28] });

          // Start/end with glow
          L.circleMarker(coords[0], { radius: 8, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 0.2, weight: 2 }).addTo(map);
          L.circleMarker(coords[0], { radius: 4, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1, weight: 0 }).addTo(map);
          L.circleMarker(coords[coords.length - 1], { radius: 8, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.2, weight: 2 }).addTo(map);
          L.circleMarker(coords[coords.length - 1], { radius: 4, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1, weight: 0 }).addTo(map);

          mapRef.current = map;
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(el);
    return () => { observer.disconnect(); mapRef.current?.remove(); };
  }, [polyline, accentColor]);

  return (
    <div className="relative z-0 isolate h-[200px] w-full overflow-hidden">
      <div ref={containerRef} onClick={onClick} className="absolute inset-0 cursor-pointer bg-neutral-900" />
    </div>
  );
}

// ── Activity cards ───────────────────────────────────────────────
function useActivityMeta(activity: CardioActivity) {
  return {
    icon: activityIcons[activity.activity_type] ?? "\u{1F3C3}",
    label: activityLabels[activity.activity_type] ?? activity.activity_type,
    accent: activityAccent[activity.activity_type] ?? "#FC4C02",
    date: new Date(activity.start_date),
  };
}

function ActivityCard({ activity, badge, onClick }: { activity: CardioActivity; badge: string | null; onClick: () => void }) {
  const polyline = getPolyline(activity);
  const { icon, label, accent, date: dateStr } = useActivityMeta(activity);

  return (
    <div className="rounded-2xl bg-[#1A1A1A] overflow-hidden" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5 cursor-pointer" onClick={onClick}>
        <div className="flex h-9 w-9 items-center justify-center rounded-full text-base" style={{ backgroundColor: `${accent}15` }}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{activity.name ?? label}</p>
          <p className="text-[11px] text-neutral-500">
            {dateStr.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
            {" · "}
            {dateStr.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
          </p>
        </div>
        {badge && (
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ backgroundColor: `${accent}20`, color: accent }}>
            <Trophy className="h-2.5 w-2.5" />{badge}
          </span>
        )}
      </div>

      {polyline ? (
        <LazyRouteMap polyline={polyline} accentColor={accent} onClick={onClick} />
      ) : (
        <div onClick={onClick} className="flex h-[100px] items-center justify-center cursor-pointer" style={{ backgroundColor: `${accent}08` }}>
          <span className="text-4xl opacity-20">{icon}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-4 py-3 overflow-x-auto cursor-pointer" onClick={onClick}>
        {activity.distance_m != null && activity.distance_m > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-neutral-800/70 px-2.5 py-1 text-[11px] font-bold text-white whitespace-nowrap shrink-0">
            <MapPin className="h-3 w-3 text-blue-400" />{formatDistance(activity.distance_m)}
          </span>
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

function CompactCard({ activity, badge, onClick }: { activity: CardioActivity; badge: string | null; onClick: () => void }) {
  const { icon, label, accent, date: dateStr } = useActivityMeta(activity);

  return (
    <div onClick={onClick} className="flex items-center gap-3 rounded-xl bg-[#1A1A1A] p-3 cursor-pointer active:scale-[0.98] transition-transform" style={{ borderLeft: `3px solid ${accent}` }}>
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{activity.name ?? label}</p>
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          <span>{dateStr.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}</span>
          {activity.distance_m != null && activity.distance_m > 0 && <span className="font-medium text-neutral-300">{formatDistance(activity.distance_m)}</span>}
          {activity.moving_time_sec != null && <span>{formatDuration(activity.moving_time_sec)}</span>}
        </div>
      </div>
      {badge && <Trophy className="h-3 w-3" style={{ color: accent }} />}
    </div>
  );
}

function StatPill({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-neutral-800/70 px-2.5 py-1 text-[11px] font-medium text-neutral-400 whitespace-nowrap shrink-0">
      {icon}{value}
    </span>
  );
}

function WeekHeader({ label, dist, time, count }: { label: string; dist: number; time: number; count: number }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-neutral-800" />
      <div className="flex items-center gap-2 text-[10px] text-neutral-500">
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-neutral-600">·</span>
        <span>{formatDistance(dist)}</span>
        <span className="text-neutral-600">·</span>
        <span>{formatDuration(time)}</span>
        <span className="text-neutral-600">·</span>
        <span>{count} {count === 1 ? "Aktivität" : "Aktivitäten"}</span>
      </div>
      <div className="h-px flex-1 bg-neutral-800" />
    </div>
  );
}

// ── Feed tab content ─────────────────────────────────────────────
function TabFeed({ activities, navigate }: { activities: CardioActivity[]; navigate: (path: string) => void }) {
  const weeks = useMemo(() => groupByWeek(activities), [activities]);
  const badges = useMemo(() => computeBadges(activities), [activities]);

  if (activities.length === 0) return null;

  return (
    <div className="space-y-3">
      {weeks.map((week, wi) => (
        <div key={week.weekLabel + week.weekNum} className="space-y-3">
          <WeekHeader label={week.weekLabel} dist={week.totalDist} time={week.totalTime} count={week.count} />
          {week.items.map((a, ai) => {
            const isFirst = wi === 0 && ai === 0;
            const isShort = (a.distance_m ?? 0) < 2000 && !isFirst;
            const badge = badges.get(a.id) ?? null;

            return isShort ? (
              <CompactCard key={a.id} activity={a} badge={badge} onClick={() => navigate(`/ausdauer/${a.id}`)} />
            ) : (
              <ActivityCard key={a.id} activity={a} badge={badge} onClick={() => navigate(`/ausdauer/${a.id}`)} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
const ACTIVITY_TYPES = [
  { key: "run", label: "Laufen", icon: "\u{1F3C3}" },
  { key: "ride", label: "Radfahren", icon: "\u{1F6B4}" },
  { key: "walk", label: "Gehen", icon: "\u{1F6B6}" },
  { key: "hike", label: "Wandern", icon: "\u{1F97E}" },
];

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "feed", label: "Feed" },
  { key: "statistiken", label: "Statistiken" },
  { key: "ziele", label: "Ziele" },
  { key: "routen", label: "Routen" },
];

export function AusdauerPage() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<CardioActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<SubTab>("feed");

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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;
  }

  // Not connected empty state
  if (!stravaConnected && activities.length === 0) {
    return (
      <div className="flex flex-col items-center gap-6 p-4 py-24 text-center">
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
    );
  }

  return (
    <div className="space-y-3 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ausdauer</h1>
        {stravaConnected && (
          <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-3 py-2 text-xs font-medium active:scale-[0.97]">
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
            {syncing ? "Sync..." : "Sync"}
          </button>
        )}
      </div>

      {/* Week dashboard */}
      {activities.length > 0 && <WeekDashboard activities={activities} />}

      {/* Connected but empty */}
      {stravaConnected && activities.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-[#1A1A1A] py-12 text-center">
          <Activity className="h-12 w-12 text-neutral-600" />
          <div>
            <p className="text-sm text-neutral-400">Keine Aktivitäten</p>
            <p className="text-xs text-neutral-600 mt-1">Tippe auf Sync um Strava-Aktivitäten zu laden</p>
          </div>
        </div>
      )}

      {/* Sub-tab navigation */}
      {activities.length > 0 && (
        <div className="flex gap-1 rounded-lg bg-neutral-900 p-1">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.key ? "bg-neutral-700 text-white" : "text-neutral-500",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {activities.length > 0 && (
        <>
          {activeTab === "feed" && <TabFeed activities={activities} navigate={navigate} />}
          {activeTab === "statistiken" && <TabStats activities={activities} />}
          {activeTab === "ziele" && <TabGoals activities={activities} />}
          {activeTab === "routen" && <TabRoutes activities={activities} />}
        </>
      )}

      {/* FAB */}
      <button
        onClick={() => setShowStartMenu(true)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FC4C02] shadow-lg shadow-[#FC4C02]/30 active:scale-90 transition-transform animate-fab-pulse"
      >
        <Play className="h-6 w-6 text-white ml-0.5" />
      </button>

      {/* Activity type picker */}
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
              {ACTIVITY_TYPES.map((t) => {
                const accent = activityAccent[t.key] ?? "#FC4C02";
                return (
                  <button
                    key={t.key}
                    onClick={() => navigate(`/ausdauer/training?type=${t.key}`)}
                    className="flex items-center gap-3 rounded-xl bg-neutral-800 p-4 active:scale-[0.97] transition-transform"
                    style={{ borderLeft: `3px solid ${accent}` }}
                  >
                    <span className="text-2xl">{t.icon}</span>
                    <span className="text-sm font-semibold">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
