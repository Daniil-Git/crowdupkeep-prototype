// src/lib/nearby.ts - DELETE useAppStore import
import { matchesFilter, type LocationFilter } from "@/lib/districts";
import { haversineKm } from "@/lib/geo";

export function pickNearbyReport(
  reports: any[],  // Remove ReturnType dependency
  origin: { lat: number; lng: number } | undefined,
  districtFilter: LocationFilter = "All Locations",
) {
  const candidates = reports
    .filter((r) => r.status === "open")
    .filter((r) => matchesFilter(r.address ?? '', districtFilter));
  if (candidates.length === 0) return null;
  if (!origin) return candidates[0];
  let best = candidates[0];
  let bestDist = haversineKm(origin, best.geometry);
  for (const r of candidates.slice(1)) {
    const d = haversineKm(origin, r.geometry);
    if (d < bestDist) {
      best = r;
      bestDist = d;
    }
  }
  return { report: best, distanceKm: bestDist };
}

