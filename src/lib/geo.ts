// Geo helpers used by the API layer and the UI.
//
// The bounding-box approach exists because SQLite cannot index or filter on
// JSON fields the way PostGIS / a GIST index can. We still want fast,
// chunked queries for "what's within X km of the user" – so we shrink the
// candidate set with a lat/lng box first and then refine with haversine in
// memory if a true radius is needed.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const EARTH_RADIUS_KM = 6371;

export function bboxFromCenter(center: LatLng, radiusKm: number): BBox {
  const latDelta = radiusKm / 111; // 1 deg lat ≈ 111 km
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  // Guard against the poles where cos(lat) -> 0
  const lngDelta = radiusKm / (111 * Math.max(cosLat, 1e-6));
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

export function pointInBBox(point: LatLng, bbox: BBox): boolean {
  return (
    point.lat >= bbox.minLat &&
    point.lat <= bbox.maxLat &&
    point.lng >= bbox.minLng &&
    point.lng <= bbox.maxLng
  );
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(x));
}
