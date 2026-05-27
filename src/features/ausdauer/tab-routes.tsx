import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { CardioActivity } from "@/types/database";
import { decodePolyline, activityAccent, getPolyline, CARTO_DARK_TILES } from "./ausdauer-utils";

interface RouteEntry {
  coords: [number, number][];
  activity: CardioActivity;
  startHash: string;
}

export function TabRoutes({ activities }: { activities: CardioActivity[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([50.1109, 8.6821], 12);

    L.tileLayer(CARTO_DARK_TILES, { maxZoom: 19 }).addTo(map);

    // Build paired array in single pass
    const routes: RouteEntry[] = [];
    const hashCounts = new Map<string, number>();

    for (const a of activities) {
      const polyStr = getPolyline(a);
      if (!polyStr) continue;

      const coords = decodePolyline(polyStr);
      if (coords.length < 2) continue;

      const startHash = `${Math.round(coords[0][0] * 1000)},${Math.round(coords[0][1] * 1000)}`;
      routes.push({ coords, activity: a, startHash });
      hashCounts.set(startHash, (hashCounts.get(startHash) ?? 0) + 1);
    }

    // Find most common start
    let mostUsedHash = "";
    let mostUsedCount = 0;
    for (const [hash, count] of hashCounts) {
      if (count > mostUsedCount) { mostUsedHash = hash; mostUsedCount = count; }
    }

    const allBounds: L.LatLngBounds[] = [];

    for (const { coords, activity, startHash } of routes) {
      const accent = activityAccent[activity.activity_type] ?? "#FC4C02";
      const isMostUsed = startHash === mostUsedHash && mostUsedCount > 1;

      L.polyline(coords, {
        color: accent,
        weight: isMostUsed ? 3 : 2,
        opacity: isMostUsed ? 0.8 : 0.35,
      }).addTo(map);

      allBounds.push(L.latLngBounds(coords));
    }

    if (allBounds.length > 0) {
      let combined = allBounds[0];
      for (let i = 1; i < allBounds.length; i++) {
        combined = combined.extend(allBounds[i]);
      }
      map.fitBounds(combined, { padding: [30, 30] });
    }

    mapInstance.current = map;

    return () => { map.remove(); mapInstance.current = null; };
  }, [activities]);

  const routeCount = activities.filter((a) => getPolyline(a)).length;

  return (
    <div className="space-y-3">
      <div className="relative z-0 isolate h-[400px] rounded-xl overflow-hidden">
        <div ref={mapRef} className="absolute inset-0 bg-neutral-900" />
      </div>
      <p className="text-center text-[10px] text-neutral-600">
        {routeCount} {routeCount === 1 ? "Route" : "Routen"} auf der Karte
      </p>
    </div>
  );
}
