import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Heart, Clock, MapPin, Flame, Mountain, Gauge,
  TrendingUp, Footprints, Timer, Zap,
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getActivityDetail, getActivityStreams } from "@/lib/strava-service";
import { supabase } from "@/lib/supabase";
import { USER_ID } from "@/lib/constants";
import type { CardioActivity } from "@/types/database";
import { decodePolyline, formatDuration, formatPace, formatDistance, CARTO_DARK_TILES } from "./ausdauer-utils";

const HR_ZONES = [
  { name: "Z1 Erholung", min: 0, max: 120, color: "oklch(0.75 0.12 145)" },
  { name: "Z2 Aerob", min: 120, max: 140, color: "oklch(0.72 0.15 170)" },
  { name: "Z3 Tempo", min: 140, max: 160, color: "oklch(0.70 0.17 85)" },
  { name: "Z4 Schwelle", min: 160, max: 175, color: "oklch(0.65 0.20 30)" },
  { name: "Z5 Maximal", min: 175, max: 999, color: "oklch(0.55 0.22 15)" },
];



// Simple SVG sparkline chart
function MiniChart({ data, color, height = 80, label }: {
  data: number[];
  color: string;
  height?: number;
  label: string;
}) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  }).join(" ");

  // Fill polygon
  const fillPoints = `0,${height} ${points} ${w},${height}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-medium text-neutral-400">{label}</p>
        <p className="text-[10px] text-neutral-600">
          {Math.round(min)}–{Math.round(max)}
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none">
        <polygon points={fillPoints} fill={color} fillOpacity="0.15" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

// Compute kilometer splits from distance + time streams
function computeSplits(distanceStream: number[], timeStream: number[]): { km: number; time: number; pace: number }[] {
  const splits: { km: number; time: number; pace: number }[] = [];
  let nextKm = 1000;
  let lastTime = 0;
  let lastDist = 0;

  for (let i = 0; i < distanceStream.length; i++) {
    if (distanceStream[i] >= nextKm) {
      const elapsed = timeStream[i] - lastTime;
      const dist = distanceStream[i] - lastDist;
      const paceSecPerKm = dist > 0 ? (elapsed / dist) * 1000 : 0;
      splits.push({ km: nextKm / 1000, time: elapsed, pace: paceSecPerKm });
      lastTime = timeStream[i];
      lastDist = distanceStream[i];
      nextKm += 1000;
    }
  }

  // Last partial km
  if (distanceStream.length > 0) {
    const lastIdx = distanceStream.length - 1;
    const remainDist = distanceStream[lastIdx] - lastDist;
    if (remainDist > 50) {
      const elapsed = timeStream[lastIdx] - lastTime;
      const paceSecPerKm = remainDist > 0 ? (elapsed / remainDist) * 1000 : 0;
      splits.push({ km: Math.round(distanceStream[lastIdx] / 10) / 100, time: elapsed, pace: paceSecPerKm });
    }
  }

  return splits;
}

export function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<CardioActivity | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [streams, setStreams] = useState<Record<string, unknown[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  // Load activity from local DB + detail from Strava + streams
  useEffect(() => {
    if (!id) return;

    const load = async () => {
      // Local DB activity
      const { data } = await supabase
        .from("cardio_activities")
        .select("*")
        .eq("id", id)
        .eq("user_id", USER_ID)
        .single();

      if (data) {
        setActivity(data as CardioActivity);

        // If strava, fetch detail + streams using external_id
        if (data.source === "strava" && data.external_id) {
          const [det, str] = await Promise.all([
            getActivityDetail(data.external_id),
            getActivityStreams(data.external_id),
          ]);
          setDetail(det);
          setStreams(str);
        }
      }
      setLoading(false);
    };

    load();
  }, [id]);

  // Render map when detail available
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const polyline = (detail?.map as { summary_polyline?: string })?.summary_polyline;
    if (!polyline) return;

    const coords = decodePolyline(polyline);
    if (coords.length < 2) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
    });

    L.tileLayer(CARTO_DARK_TILES, { maxZoom: 19 }).addTo(map);

    const line = L.polyline(coords, {
      color: "oklch(0.75 0.18 30)",
      weight: 3,
      opacity: 0.9,
    }).addTo(map);

    map.fitBounds(line.getBounds(), { padding: [20, 20] });

    // Start/end markers
    L.circleMarker(coords[0], { radius: 5, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1, weight: 0 }).addTo(map);
    L.circleMarker(coords[coords.length - 1], { radius: 5, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1, weight: 0 }).addTo(map);

    mapInstance.current = map;

    return () => { map.remove(); mapInstance.current = null; };
  }, [detail]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-500">Laden...</div>;
  }

  if (!activity) {
    return (
      <div className="p-4">
        <button onClick={() => navigate("/ausdauer")} className="flex items-center gap-1.5 text-sm text-neutral-400">
          <ArrowLeft className="h-4 w-4" /> Zurück
        </button>
        <p className="mt-8 text-center text-neutral-500">Aktivität nicht gefunden</p>
      </div>
    );
  }

  const raw = activity.raw_data ?? {};
  const hrStream = (streams?.heartrate ?? []) as number[];
  const altStream = (streams?.altitude ?? []) as number[];
  const velStream = (streams?.velocity_smooth ?? []) as number[];
  const cadStream = (streams?.cadence ?? []) as number[];
  const distStream = (streams?.distance ?? []) as number[];
  const timeStream = (streams?.time ?? []) as number[];

  // Pace stream: convert m/s to sec/km (invert, filter zeros)
  const paceStream = velStream.map((v) => (v as number) > 0.3 ? 1000 / (v as number) : 0).filter(Boolean);

  // HR zone distribution
  const hrZoneCounts = HR_ZONES.map(() => 0);
  for (const hr of hrStream) {
    const idx = HR_ZONES.findIndex((z) => (hr as number) >= z.min && (hr as number) < z.max);
    if (idx >= 0) hrZoneCounts[idx]++;
  }
  const hrTotal = hrZoneCounts.reduce((a, b) => a + b, 0) || 1;

  // Splits
  const splits = distStream.length > 0 && timeStream.length > 0
    ? computeSplits(distStream as number[], timeStream as number[])
    : [];

  const avgPace = splits.length > 0
    ? splits.reduce((s, sp) => s + sp.pace, 0) / splits.length
    : null;

  const hasMap = !!(detail?.map as { summary_polyline?: string })?.summary_polyline;

  return (
    <div className="space-y-3 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/ausdauer")} className="rounded-lg bg-neutral-800 p-2 active:scale-95">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{activity.name ?? activity.activity_type}</h1>
          <p className="text-xs text-neutral-500">
            {new Date(activity.start_date).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            {new Date(activity.start_date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
          </p>
        </div>
      </div>

      {/* Map */}
      {hasMap && (
        <div ref={mapRef} className="h-48 rounded-xl overflow-hidden bg-neutral-900" />
      )}

      {/* Key stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {activity.distance_m != null && activity.distance_m > 0 && (
          <StatCard icon={<MapPin className="h-3.5 w-3.5 text-blue-400" />} value={formatDistance(activity.distance_m)} label="Distanz" />
        )}
        {activity.moving_time_sec != null && (
          <StatCard icon={<Clock className="h-3.5 w-3.5 text-green-400" />} value={formatDuration(activity.moving_time_sec)} label="Dauer" />
        )}
        {activity.avg_pace_sec_per_km != null && (
          <StatCard icon={<Gauge className="h-3.5 w-3.5 text-purple-400" />} value={`${formatPace(activity.avg_pace_sec_per_km)} /km`} label="Pace" />
        )}
        {activity.avg_heartrate != null && (
          <StatCard icon={<Heart className="h-3.5 w-3.5 text-red-400" />} value={`${activity.avg_heartrate} bpm`} label="Herzfrequenz" />
        )}
        {activity.max_heartrate != null && (
          <StatCard icon={<TrendingUp className="h-3.5 w-3.5 text-red-300" />} value={`${activity.max_heartrate} bpm`} label="Max HR" />
        )}
        {activity.elevation_gain_m != null && activity.elevation_gain_m > 0 && (
          <StatCard icon={<Mountain className="h-3.5 w-3.5 text-amber-400" />} value={`${Math.round(activity.elevation_gain_m)} m`} label="Höhenmeter" />
        )}
        {activity.calories != null && activity.calories > 0 && (
          <StatCard icon={<Flame className="h-3.5 w-3.5 text-orange-400" />} value={`${activity.calories}`} label="Kalorien" />
        )}
        {activity.elapsed_time_sec != null && activity.moving_time_sec != null && activity.elapsed_time_sec > activity.moving_time_sec && (
          <StatCard icon={<Timer className="h-3.5 w-3.5 text-neutral-400" />} value={formatDuration(activity.elapsed_time_sec)} label="Gesamt" />
        )}
        {(raw as Record<string, unknown>).suffer_score != null && (
          <StatCard icon={<Zap className="h-3.5 w-3.5 text-yellow-400" />} value={String((raw as Record<string, unknown>).suffer_score)} label="Suffer Score" />
        )}
      </div>

      {/* HR Zone Distribution */}
      {hrStream.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs font-medium text-neutral-400 mb-3">Herzfrequenz-Zonen</p>
          <div className="space-y-1.5">
            {HR_ZONES.map((zone, i) => {
              const pct = (hrZoneCounts[i] / hrTotal) * 100;
              if (pct < 0.5) return null;
              return (
                <div key={zone.name} className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-500 w-20 shrink-0">{zone.name}</span>
                  <div className="flex-1 h-4 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: zone.color }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-500 w-10 text-right">{Math.round(pct)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts */}
      {hrStream.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <MiniChart data={hrStream as number[]} color="oklch(0.65 0.22 15)" label="Herzfrequenz (bpm)" />
        </div>
      )}

      {paceStream.length > 0 && activity.activity_type === "run" && (
        <div className="rounded-xl bg-card p-4">
          <MiniChart data={paceStream} color="oklch(0.70 0.17 270)" label="Pace (s/km)" height={60} />
        </div>
      )}

      {altStream.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <MiniChart data={altStream as number[]} color="oklch(0.70 0.15 85)" label="Höhe (m)" height={50} />
        </div>
      )}

      {cadStream.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <MiniChart data={cadStream as number[]} color="oklch(0.72 0.14 170)" label="Kadenz (spm)" height={50} />
        </div>
      )}

      {velStream.length > 0 && activity.activity_type !== "run" && (
        <div className="rounded-xl bg-card p-4">
          <MiniChart
            data={(velStream as number[]).map((v) => v * 3.6)}
            color="oklch(0.70 0.17 270)"
            label="Geschwindigkeit (km/h)"
            height={60}
          />
        </div>
      )}

      {/* Splits */}
      {splits.length > 1 && (
        <div className="rounded-xl bg-card p-4">
          <p className="text-xs font-medium text-neutral-400 mb-3">
            <Footprints className="inline h-3 w-3 mr-1" />
            Splits
          </p>
          <div className="space-y-1">
            {splits.map((sp, i) => {
              const fastest = Math.min(...splits.map((s) => s.pace));
              const slowest = Math.max(...splits.map((s) => s.pace));
              const range = slowest - fastest || 1;
              const pct = ((sp.pace - fastest) / range);
              // Green = fast, Red = slow
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-600 w-8 text-right">{sp.km}</span>
                  <div className="flex-1 h-5 rounded bg-neutral-800 overflow-hidden relative">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${Math.max(15, (1 - pct) * 100)}%`,
                        backgroundColor: pct < 0.3 ? "oklch(0.65 0.15 145)" : pct < 0.7 ? "oklch(0.70 0.12 85)" : "oklch(0.60 0.18 25)",
                      }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium">
                      {formatPace(sp.pace)} /km
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-600 w-12 text-right">{formatDuration(Math.round(sp.time))}</span>
                </div>
              );
            })}
          </div>
          {avgPace && (
            <p className="mt-2 text-[10px] text-neutral-600 text-center">
              Durchschnitt: {formatPace(avgPace)} /km
            </p>
          )}
        </div>
      )}

      {/* Extra detail from Strava */}
      {detail && (
        <div className="rounded-xl bg-card p-4 space-y-2">
          <p className="text-xs font-medium text-neutral-400">Details</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {(detail.average_cadence as number) > 0 && (
              <DetailRow label="Kadenz" value={`${Math.round(detail.average_cadence as number * 2)} spm`} />
            )}
            {(detail.average_temp as number) != null && (
              <DetailRow label="Temperatur" value={`${detail.average_temp}°C`} />
            )}
            {(detail.device_name as string) && (
              <DetailRow label="Gerät" value={detail.device_name as string} />
            )}
            {(detail.gear as { name: string })?.name && (
              <DetailRow label="Ausrüstung" value={(detail.gear as { name: string }).name} />
            )}
            {(detail.pr_count as number) > 0 && (
              <DetailRow label="PRs" value={String(detail.pr_count)} />
            )}
            {(detail.achievement_count as number) > 0 && (
              <DetailRow label="Achievements" value={String(detail.achievement_count)} />
            )}
          </div>
          {(detail.description as string) && (
            <p className="text-[11px] text-neutral-500 mt-2">{detail.description as string}</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-lg bg-card p-2.5 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-sm font-bold">{value}</span>
      </div>
      <span className="text-[10px] text-neutral-500">{label}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-neutral-600">{label}</span>
      <span className="text-neutral-300 font-medium">{value}</span>
    </>
  );
}
