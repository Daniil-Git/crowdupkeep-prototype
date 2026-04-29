// Limassol districts derived from the seed-data addresses. Keeping the list
// here (rather than on the Prisma model) means the location filter is a pure
// UI concern — the data layer just stores free-form addresses, and any new
// neighbourhood seeded later only needs an entry in DISTRICT_MATCHERS.

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
