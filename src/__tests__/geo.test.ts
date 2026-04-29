import { describe, expect, it } from "vitest";
import {
  bboxFromCenter,
  haversineKm,
  pointInBBox,
} from "@/lib/geo";

const LIMASSOL = { lat: 34.7071, lng: 33.0226 };
const NICOSIA = { lat: 35.1856, lng: 33.3823 };
const PAFOS = { lat: 34.7768, lng: 32.4245 };

describe("geo helpers", () => {
  it("builds a symmetric bounding box around the centre", () => {
    const bbox = bboxFromCenter(LIMASSOL, 5);
    expect(bbox.minLat).toBeLessThan(LIMASSOL.lat);
    expect(bbox.maxLat).toBeGreaterThan(LIMASSOL.lat);
    expect(bbox.minLng).toBeLessThan(LIMASSOL.lng);
    expect(bbox.maxLng).toBeGreaterThan(LIMASSOL.lng);
    // Latitude width ≈ 5/111 deg either side -> total ~0.09deg.
    const latSpan = bbox.maxLat - bbox.minLat;
    expect(latSpan).toBeCloseTo((2 * 5) / 111, 3);
  });

  it("includes the centre point in the bbox", () => {
    const bbox = bboxFromCenter(LIMASSOL, 1);
    expect(pointInBBox(LIMASSOL, bbox)).toBe(true);
  });

  it("excludes a clearly far-away point", () => {
    const bbox = bboxFromCenter(LIMASSOL, 5);
    expect(pointInBBox(NICOSIA, bbox)).toBe(false);
    expect(pointInBBox(PAFOS, bbox)).toBe(false);
  });

  it("includes points near the boundary", () => {
    // ~3km north of Limassol; should be inside a 5km bbox.
    const near = { lat: LIMASSOL.lat + 3 / 111, lng: LIMASSOL.lng };
    const bbox = bboxFromCenter(LIMASSOL, 5);
    expect(pointInBBox(near, bbox)).toBe(true);
  });

  it("haversine returns 0 for identical points", () => {
    expect(haversineKm(LIMASSOL, LIMASSOL)).toBeCloseTo(0, 5);
  });

  it("haversine matches a known distance Limassol→Nicosia (~62km)", () => {
    const d = haversineKm(LIMASSOL, NICOSIA);
    expect(d).toBeGreaterThan(55);
    expect(d).toBeLessThan(70);
  });

  it("haversine is symmetric", () => {
    const a = haversineKm(LIMASSOL, PAFOS);
    const b = haversineKm(PAFOS, LIMASSOL);
    expect(a).toBeCloseTo(b, 6);
  });

  it("handles negative coordinates without crashing", () => {
    const south = { lat: -34.5, lng: -58.5 };
    const bbox = bboxFromCenter(south, 10);
    expect(pointInBBox(south, bbox)).toBe(true);
  });
});
