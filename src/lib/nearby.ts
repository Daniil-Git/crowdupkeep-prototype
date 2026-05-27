import { matchesFilter, type LocationFilter } from "@/lib/districts";
import { haversineKm, type LatLng } from "@/lib/geo";

// Minimal shape this picker needs from a report. Kept narrow so any future
// report-like value (raw API row, store entry, ad-hoc test fixture) plugs in
// without coupling to the full UiReport interface. No `[key: string]: unknown`
// index signature — TS structural subtyping already permits extra fields on
// arguments, and the explicit signature was making concrete types with
// non-unknown-assignable shapes (`UiReport`'s nested `comments`/`solutions`)
// fail the index-signature check on TS 5.x, cascading into "type '{}' is not
// assignable to number" errors at the `picked.report.difficulty` call sites.
export interface NearbyCandidate {
  id: number;
  status: "pending" | "in-progress" | "solved";
  address: string;
  geometry: LatLng;
}

export type NearbyPick<T extends NearbyCandidate> =
  | T
  | { report: T; distanceKm: number }
  | null;

// Picks the closest "pending" report to the user's last known location. When
// a district filter is active the candidate set is narrowed first — if a user
// has hidden Dasoudi, the proximity prompt should not surface a Dasoudi
// issue and break the mental model.
//
// Status filter is "pending" (not "open") because the canonical UiReport
// status enum is "pending" | "in-progress" | "solved". Filtering on the
// wrong literal silently empties the candidate set, which is exactly the
// regression that left the popup permanently in its default-copy fallback.
// Convenience predicate used by both the Dashboard trigger and the overlay's
// render gate: "is there anything worth opening the popup for?" Keeping it
// here (next to the picker it wraps) means the answer can't drift between
// "should we open" and "what would we render" — they share the exact same
// candidate set.
export function hasNearbyReport<T extends NearbyCandidate>(
  reports: ReadonlyArray<T>,
  origin: LatLng | undefined,
  districtFilter: LocationFilter = "All Locations",
): boolean {
  return pickNearbyReport(reports, origin, districtFilter) !== null;
}

export function pickNearbyReport<T extends NearbyCandidate>(
  reports: ReadonlyArray<T>,
  origin: LatLng | undefined,
  districtFilter: LocationFilter = "All Locations",
): NearbyPick<T> {
  const candidates = reports
    .filter((r) => r.status === "pending")
    .filter((r) => matchesFilter(r.address ?? "", districtFilter));
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
