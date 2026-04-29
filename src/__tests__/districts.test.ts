import { describe, expect, it } from "vitest";
import {
  ALL_LOCATIONS,
  DISTRICTS,
  LOCATION_OPTIONS,
  addressToDistrict,
  matchesFilter,
} from "@/lib/districts";

describe("districts", () => {
  it("includes 'All Locations' as the first dropdown option", () => {
    expect(LOCATION_OPTIONS[0]).toBe(ALL_LOCATIONS);
    // All districts are reachable from the dropdown.
    for (const d of DISTRICTS) {
      expect(LOCATION_OPTIONS).toContain(d);
    }
  });

  it("maps the seed-data addresses to known districts", () => {
    expect(addressToDistrict("Limassol Old Port")).toBe("Old Port");
    expect(addressToDistrict("Molos Promenade, Limassol")).toBe("Molos");
    expect(addressToDistrict("Dasoudi Beach, Limassol")).toBe("Dasoudi");
    expect(addressToDistrict("Heroes Square, Limassol")).toBe("Old Town");
    expect(addressToDistrict("Anexartisias Street, Limassol")).toBe("Centre");
    expect(addressToDistrict("Spyrou Kyprianou Avenue, Limassol")).toBe("Centre");
  });

  it("falls back to 'Other' for addresses that don't match a known district", () => {
    expect(addressToDistrict("Children's Park, Limassol")).toBe("Other");
    expect(addressToDistrict("Some Unknown Place")).toBe("Other");
  });

  it("matchesFilter is the identity for All Locations", () => {
    expect(matchesFilter("anything", ALL_LOCATIONS)).toBe(true);
    expect(matchesFilter("Limassol Old Port", ALL_LOCATIONS)).toBe(true);
  });

  it("matchesFilter narrows by district", () => {
    expect(matchesFilter("Limassol Old Port", "Old Port")).toBe(true);
    expect(matchesFilter("Limassol Old Port", "Molos")).toBe(false);
    expect(matchesFilter("Heroes Square, Limassol", "Old Town")).toBe(true);
  });

  it("is case-insensitive in matching", () => {
    expect(addressToDistrict("limassol OLD port")).toBe("Old Port");
    expect(addressToDistrict("ANEXARTISIAS")).toBe("Centre");
  });
});
