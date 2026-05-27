import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Play, Pause, Square, Flag, MapPin, Clock, Gauge, Mountain, ArrowLeft } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { saveManualActivity } from "@/lib/strava-service";
import { cn } from "@/lib/utils";
import { CARTO_DARK_TILES } from "./ausdauer-utils";

interface GpsPoint {
  lat: number;
  lng: number;
  alt: number;
  time: number; // ms timestamp
}

interface Lap {
  km: number;
  time: number; // seconds for this lap
  pace: number; // sec/km
}

type TrainingState = "ready" | "running" | "paused" | "finished";

const ACTIVITY_TYPES = [
  { key: "run", label: "Laufen", icon: "\u{1F3C3}" },
  { key: "ride", label: "Radfahren", icon: "\u{1F6B4}" },
  { key: "walk", label: "Gehen", icon: "\u{1F6B6}" },
  { key: "hike", label: "Wandern", icon: "\u{1F97E}" },
];

// Haversine distance in meters
function haversine(a: GpsPoint, b: GpsPoint): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(secPerKm: number): string {
  if (!secPerKm || !isFinite(secPerKm) || secPerKm > 3600) return "--:--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Encode [lat, lng][] to Google polyline format
function encodePolyline(points: [number, number][]): string {
  let encoded = "";
  let pLat = 0, pLng = 0;
  for (const [lat, lng] of points) {
    const dLat = Math.round(lat * 1e5) - pLat;
    const dLng = Math.round(lng * 1e5) - pLng;
    pLat += dLat;
    pLng += dLng;
    for (const d of [dLat, dLng]) {
      let v = d < 0 ? ~(d << 1) : d << 1;
      while (v >= 0x20) { encoded += String.fromCharCode((v & 0x1f) | 0x20 + 63); v >>= 5; }
      encoded += String.fromCharCode(v + 63);
    }
  }
  return encoded;
}

export function LiveTrainingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activityType = searchParams.get("type") ?? "run";
  const activityLabel = ACTIVITY_TYPES.find((t) => t.key === activityType)?.label ?? activityType;

  const [state, setState] = useState<TrainingState>("ready");
  const [elapsed, setElapsed] = useState(0); // ms of active running time
  const [distance, setDistance] = useState(0); // meters
  const [currentPace, setCurrentPace] = useState(0); // sec/km
  const [avgPace, setAvgPace] = useState(0); // sec/km
  const [elevation, setElevation] = useState(0); // meters gained
  const [laps, setLaps] = useState<Lap[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Refs for tracking state without re-renders
  const points = useRef<GpsPoint[]>([]);
  const startTime = useRef(0);
  const pausedAt = useRef(0);
  const totalPaused = useRef(0);
  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastLapDist = useRef(0);
  const lastLapTime = useRef(0);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const posMarkerRef = useRef<L.CircleMarker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([50.1109, 8.6821], 15); // Frankfurt default

    L.tileLayer(CARTO_DARK_TILES, { maxZoom: 19 }).addTo(map);

    const line = L.polyline([], {
      color: "oklch(0.75 0.18 30)",
      weight: 4,
      opacity: 0.9,
    }).addTo(map);

    const marker = L.circleMarker([0, 0], {
      radius: 7,
      color: "oklch(0.75 0.18 30)",
      fillColor: "oklch(0.75 0.18 30)",
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    mapRef.current = map;
    polylineRef.current = line;
    posMarkerRef.current = marker;

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Request wake lock
  const requestWakeLock = useCallback(async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLock.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Wake lock not available or denied
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLock.current?.release();
    wakeLock.current = null;
  }, []);

  // GPS handler
  const onPosition = useCallback((pos: GeolocationPosition) => {
    setGpsError(null);
    const pt: GpsPoint = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      alt: pos.coords.altitude ?? 0,
      time: pos.timestamp,
    };

    const prev = points.current[points.current.length - 1];
    points.current.push(pt);

    // Update map
    const latLng: L.LatLngExpression = [pt.lat, pt.lng];
    polylineRef.current?.addLatLng(latLng);
    posMarkerRef.current?.setLatLng(latLng);
    mapRef.current?.panTo(latLng);

    if (points.current.length === 1) {
      mapRef.current?.setView(latLng, 16);
      // Add start marker
      L.circleMarker(latLng, { radius: 5, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1, weight: 0 }).addTo(mapRef.current!);
    }

    if (!prev) return;

    const d = haversine(prev, pt);
    // Filter GPS noise: ignore jumps > 50m in one update or < 1m
    if (d > 50 || d < 1) return;

    setDistance((prev) => prev + d);

    // Elevation gain
    if (pt.alt > prev.alt) {
      setElevation((e) => e + (pt.alt - prev.alt));
    }

    // Current pace from last 5 points
    const recent = points.current.slice(-6);
    if (recent.length >= 2) {
      let recentDist = 0;
      for (let i = 1; i < recent.length; i++) recentDist += haversine(recent[i - 1], recent[i]);
      const recentTime = (recent[recent.length - 1].time - recent[0].time) / 1000;
      if (recentDist > 5) {
        setCurrentPace((recentTime / recentDist) * 1000);
      }
    }
  }, []);

  // Start training
  const start = useCallback(() => {
    setState("running");
    startTime.current = Date.now();
    totalPaused.current = 0;

    requestWakeLock();

    // GPS
    watchId.current = navigator.geolocation.watchPosition(
      onPosition,
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    );

    // Timer: update elapsed every second
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTime.current - totalPaused.current);
    }, 1000);
  }, [onPosition, requestWakeLock]);

  // Pause
  const pause = useCallback(() => {
    setState("paused");
    pausedAt.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Resume
  const resume = useCallback(() => {
    setState("running");
    totalPaused.current += Date.now() - pausedAt.current;

    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTime.current - totalPaused.current);
    }, 1000);
  }, []);

  // Stop
  const stop = useCallback(() => {
    setState("finished");
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (timerRef.current) clearInterval(timerRef.current);
    releaseWakeLock();

    // Add end marker
    const last = points.current[points.current.length - 1];
    if (last && mapRef.current) {
      L.circleMarker([last.lat, last.lng], { radius: 5, color: "#ef4444", fillColor: "#ef4444", fillOpacity: 1, weight: 0 }).addTo(mapRef.current);
      // Fit to route
      if (polylineRef.current && points.current.length > 1) {
        mapRef.current.fitBounds(polylineRef.current.getBounds(), { padding: [30, 30] });
      }
    }
  }, [releaseWakeLock]);

  // Lap
  const addLap = useCallback(() => {
    const km = laps.length + 1;
    const lapDist = distance - lastLapDist.current;
    const lapTime = elapsed / 1000 - lastLapTime.current;
    const pace = lapDist > 0 ? (lapTime / lapDist) * 1000 : 0;

    setLaps((prev) => [...prev, { km, time: lapTime, pace }]);
    lastLapDist.current = distance;
    lastLapTime.current = elapsed / 1000;
  }, [distance, elapsed, laps.length]);

  // Update avg pace
  useEffect(() => {
    if (distance > 10 && elapsed > 0) {
      setAvgPace((elapsed / 1000 / distance) * 1000);
    }
  }, [distance, elapsed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      if (timerRef.current) clearInterval(timerRef.current);
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  // Save activity
  const save = async () => {
    setSaving(true);
    const elapsedSec = Math.round(elapsed / 1000);
    const movingSec = elapsedSec; // Approximation — paused time already excluded
    const coords: [number, number][] = points.current.map((p) => [p.lat, p.lng]);
    const polyline = coords.length > 1 ? encodePolyline(coords) : "";

    try {
      await saveManualActivity({
        activity_type: activityType,
        name: `${activityLabel} – ${new Date().toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`,
        start_date: new Date(startTime.current).toISOString(),
        elapsed_time_sec: elapsedSec,
        moving_time_sec: movingSec,
        distance_m: Math.round(distance),
        elevation_gain_m: Math.round(elevation),
        avg_pace_sec_per_km: distance > 0 ? Math.round((elapsedSec / distance) * 1000) : null,
        avg_speed_ms: elapsedSec > 0 ? distance / elapsedSec : null,
        calories: Math.round(elapsedSec / 60 * (activityType === "run" ? 10 : activityType === "ride" ? 7 : 5)),
        raw_data: {
          source: "live_tracking",
          laps,
          point_count: points.current.length,
          map: { summary_polyline: polyline },
        },
      });
      navigate("/ausdauer");
    } catch (err) {
      console.error("Save error:", err);
      setSaving(false);
    }
  };

  const isActive = state === "running" || state === "paused";

  return (
    <div className="flex flex-col h-[100dvh] bg-neutral-950">
      {/* Map — top half */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* Back button overlay */}
        {state === "ready" && (
          <button
            onClick={() => navigate("/ausdauer")}
            className="absolute top-4 left-4 z-[1000] rounded-lg bg-neutral-900/80 p-2 backdrop-blur-sm active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        {/* GPS status */}
        {gpsError && (
          <div className="absolute top-4 right-4 z-[1000] rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-400 backdrop-blur-sm">
            GPS: {gpsError}
          </div>
        )}

        {/* Activity type badge */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] rounded-full bg-neutral-900/80 px-3 py-1 text-xs font-medium backdrop-blur-sm">
          {ACTIVITY_TYPES.find((t) => t.key === activityType)?.icon} {activityLabel}
        </div>
      </div>

      {/* Stats + controls — bottom half */}
      <div className="shrink-0 bg-neutral-950 px-4 pt-4 pb-6 safe-area-bottom">
        {/* Live stats */}
        {(isActive || state === "finished") && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <StatBlock label="Distanz" value={distance >= 1000 ? `${(distance / 1000).toFixed(2)}` : `0.${String(Math.round(distance)).padStart(3, "0")}`} unit="km" icon={<MapPin className="h-3.5 w-3.5 text-blue-400" />} large />
            <StatBlock label="Dauer" value={formatDuration(elapsed)} icon={<Clock className="h-3.5 w-3.5 text-green-400" />} large />
            <StatBlock label="Pace" value={formatPace(currentPace)} unit="/km" icon={<Gauge className="h-3.5 w-3.5 text-purple-400" />} />
            <StatBlock label="Ø Pace" value={formatPace(avgPace)} unit="/km" icon={<Gauge className="h-3.5 w-3.5 text-purple-300" />} />
            {elevation > 0 && (
              <StatBlock label="Höhenmeter" value={`${Math.round(elevation)}`} unit="m" icon={<Mountain className="h-3.5 w-3.5 text-amber-400" />} />
            )}
          </div>
        )}

        {/* Laps */}
        {laps.length > 0 && state !== "finished" && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {laps.map((lap) => (
              <span key={lap.km} className="shrink-0 rounded-full bg-neutral-800 px-2.5 py-1 text-[10px] font-medium">
                Km {lap.km}: {formatPace(lap.pace)} /km
              </span>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {state === "ready" && (
            <button
              onClick={start}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FC4C02] active:scale-95 transition-transform"
            >
              <Play className="h-7 w-7 text-white ml-1" />
            </button>
          )}

          {state === "running" && (
            <>
              <button
                onClick={addLap}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 active:scale-95"
              >
                <Flag className="h-5 w-5 text-neutral-300" />
              </button>
              <button
                onClick={pause}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 active:scale-95 transition-transform"
              >
                <Pause className="h-7 w-7 text-black" />
              </button>
              <button
                onClick={stop}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800 active:scale-95"
              >
                <Square className="h-5 w-5 text-red-400" />
              </button>
            </>
          )}

          {state === "paused" && (
            <>
              <button
                onClick={resume}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FC4C02] active:scale-95 transition-transform"
              >
                <Play className="h-7 w-7 text-white ml-1" />
              </button>
              <button
                onClick={stop}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 active:scale-95"
              >
                <Square className="h-5 w-5 text-red-400" />
              </button>
            </>
          )}

          {state === "finished" && (
            <div className="flex w-full gap-3">
              <button
                onClick={() => navigate("/ausdauer")}
                className="flex-1 rounded-xl bg-neutral-800 py-3.5 text-sm font-medium active:scale-[0.98]"
              >
                Verwerfen
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 rounded-xl bg-[#FC4C02] py-3.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? "Speichern..." : "Speichern"}
              </button>
            </div>
          )}
        </div>

        {/* Finished: laps summary */}
        {state === "finished" && laps.length > 0 && (
          <div className="mt-4 rounded-xl bg-neutral-900 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">Runden</p>
            <div className="space-y-1">
              {laps.map((lap) => (
                <div key={lap.km} className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Km {lap.km}</span>
                  <span className="font-medium">{formatPace(lap.pace)} /km</span>
                  <span className="text-neutral-500">{formatDuration(lap.time * 1000)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBlock({ label, value, unit, icon, large }: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  large?: boolean;
}) {
  return (
    <div className="rounded-xl bg-neutral-900 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-neutral-500">{label}</span>
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className={cn("font-bold tabular-nums", large ? "text-2xl" : "text-lg")}>{value}</span>
        {unit && <span className="text-xs text-neutral-500">{unit}</span>}
      </div>
    </div>
  );
}
