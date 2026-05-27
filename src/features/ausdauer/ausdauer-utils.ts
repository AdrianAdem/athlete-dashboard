import type { CardioActivity } from "@/types/database";

export const CARTO_DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function getPolyline(a: CardioActivity): string | undefined {
  return (a.raw_data?.map as { summary_polyline?: string })?.summary_polyline;
}

export const activityLabels: Record<string, string> = {
  run: "Laufen", ride: "Radfahren", swim: "Schwimmen", walk: "Gehen",
  hike: "Wandern", weight_training: "Krafttraining", workout: "Workout",
  yoga: "Yoga", crossfit: "CrossFit", rowing: "Rudern",
};

export const activityIcons: Record<string, string> = {
  run: "\u{1F3C3}", ride: "\u{1F6B4}", swim: "\u{1F3CA}", walk: "\u{1F6B6}",
  hike: "\u{1F97E}", weight_training: "\u{1F3CB}", workout: "\u{1F4AA}",
  yoga: "\u{1F9D8}", crossfit: "\u{1F3CB}", rowing: "\u{1F6A3}",
};

export const activityAccent: Record<string, string> = {
  run: "#FC4C02",
  ride: "#3B82F6",
  swim: "#06B6D4",
  walk: "#22C55E",
  hike: "#F59E0B",
};

export function decodePolyline(encoded: string): [number, number][] {
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

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getPrevWeekStart(d: Date): Date {
  const ws = getWeekStart(d);
  ws.setDate(ws.getDate() - 7);
  return ws;
}

export interface WeekGroup {
  weekLabel: string;
  weekNum: number;
  items: CardioActivity[];
  totalDist: number;
  totalTime: number;
  count: number;
}

export function groupByWeek(activities: CardioActivity[]): WeekGroup[] {
  const groups = new Map<string, CardioActivity[]>();

  for (const a of activities) {
    const d = new Date(a.start_date);
    const wn = getWeekNumber(d);
    const yr = d.getFullYear();
    const key = `${yr}-W${wn}`;
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }

  const now = new Date();
  const currentWeek = getWeekNumber(now);
  const currentYear = now.getFullYear();

  return Array.from(groups.entries()).map(([key, items]) => {
    const wn = parseInt(key.split("W")[1]);
    const yr = parseInt(key.split("-")[0]);

    let weekLabel: string;
    if (yr === currentYear && wn === currentWeek) weekLabel = "Diese Woche";
    else if (yr === currentYear && wn === currentWeek - 1) weekLabel = "Letzte Woche";
    else weekLabel = `KW ${wn}`;

    const totalDist = items.reduce((s, a) => s + (a.distance_m ?? 0), 0);
    const totalTime = items.reduce((s, a) => s + (a.moving_time_sec ?? 0), 0);

    return { weekLabel, weekNum: wn, items, totalDist, totalTime, count: items.length };
  });
}

export function computeBadges(activities: CardioActivity[]): Map<string, string> {
  const badges = new Map<string, string>();
  const weeks = new Map<string, CardioActivity[]>();

  for (const a of activities) {
    const d = new Date(a.start_date);
    const key = `${d.getFullYear()}-W${getWeekNumber(d)}`;
    const list = weeks.get(key) ?? [];
    list.push(a);
    weeks.set(key, list);
  }

  for (const [, items] of weeks) {
    if (items.length < 2) continue;
    const runs = items.filter((a) => a.activity_type === "run" && a.avg_pace_sec_per_km != null);
    if (runs.length >= 2) {
      const fastest = runs.reduce((best, a) => (a.avg_pace_sec_per_km! < best.avg_pace_sec_per_km! ? a : best));
      badges.set(fastest.id, "Schnellster Lauf");
    }
    const withDist = items.filter((a) => a.distance_m != null && a.distance_m > 0);
    if (withDist.length >= 2) {
      const longest = withDist.reduce((best, a) => ((a.distance_m ?? 0) > (best.distance_m ?? 0) ? a : best));
      if (!badges.has(longest.id)) badges.set(longest.id, "Längste Distanz");
    }
  }

  return badges;
}

/** @returns 0=Mon .. 6=Sun */
export function getDayOfWeek(d: Date): number {
  return (d.getDay() + 6) % 7;
}
