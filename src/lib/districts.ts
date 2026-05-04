// Limassol districts derived from the seed-data addresses. Keeping the list
// here (rather than on the Prisma model) means the location filter is a pure
// UI concern — the data layer just stores free-form addresses, and any new
// neighbourhood seeded later only needs an entry in DISTRICT_MATCHERS.

import type { LatLng } from "@/lib/geo";

export const ALL_LOCATIONS = "All Locations" as const;

// The user-facing labels. Order matters for the dropdown.
export const DISTRICTS = [
  "Old Town",
  "Old Port",
  "Molos",
  "Dasoudi",
  "Centre",
  "Other",
] as const;

export type District = (typeof DISTRICTS)[number];

export type LocationFilter = District | typeof ALL_LOCATIONS;

// First match wins. The patterns are case-insensitive substrings; this keeps
// matching forgiving for free-form addresses ("Heroes Square, Limassol",
// "Anexartisias Street", etc.).
const DISTRICT_MATCHERS: ReadonlyArray<{ pattern: RegExp; district: District }> = [
  { pattern: /old port|marina/i, district: "Old Port" },
  { pattern: /molos|seafront|promenade/i, district: "Molos" },
  { pattern: /dasoudi/i, district: "Dasoudi" },
  { pattern: /heroes square|old town/i, district: "Old Town" },
  { pattern: /anexartisias|spyrou kyprianou|makarios/i, district: "Centre" },
];

export function addressToDistrict(address: string): District {
  for (const { pattern, district } of DISTRICT_MATCHERS) {
    if (pattern.test(address)) return district;
  }
  return "Other";
}

export function isAllLocations(filter: LocationFilter): filter is typeof ALL_LOCATIONS {
  return filter === ALL_LOCATIONS;
}

export function matchesFilter(address: string, filter: LocationFilter): boolean {
  if (isAllLocations(filter)) return true;
  return addressToDistrict(address) === filter;
}

export const LOCATION_OPTIONS: ReadonlyArray<LocationFilter> = [
  ALL_LOCATIONS,
  ...DISTRICTS,
];

// Representative geometry + canonical address for each district. Used when a
// new report is filed under a district context and we need a sensible
// (geometry, address) pair the matchers will recognise. Coords are taken
// from the seed-data anchors so new pins land in the visually expected zone.
export const DISTRICT_CENTERS: Record<District, { geometry: LatLng; address: string }> = {
  "Old Town":  { geometry: { lat: 34.6755, lng: 33.0421 }, address: "Heroes Square, Old Town, Limassol" },
  "Old Port":  { geometry: { lat: 34.6712, lng: 33.0431 }, address: "Limassol Old Port" },
  Molos:       { geometry: { lat: 34.6710, lng: 33.0445 }, address: "Molos Promenade, Limassol" },
  Dasoudi:     { geometry: { lat: 34.7025, lng: 33.0681 }, address: "Dasoudi Beach, Limassol" },
  Centre:      { geometry: { lat: 34.6845, lng: 33.0390 }, address: "Anexartisias Street, Limassol" },
  Other:       { geometry: { lat: 34.7088, lng: 33.0253 }, address: "Limassol" },
};
