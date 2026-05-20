import { describe, expect, it } from "vitest";
import {
  CYPRIOT_ID_REGEX,
  CypriotIdFormatError,
  canonicalize,
  canonicalizeOrThrow,
  isValidCypriotId,
} from "@/lib/cypriotId";

describe("canonicalize", () => {
  it("strips ASCII whitespace and dashes", () => {
    expect(canonicalize("  12-34 56 78-90  ")).toBe("1234567890");
  });

  it("strips letters, punctuation, and tabs/newlines", () => {
    expect(canonicalize("ID:1234567890\tCY\n")).toBe("1234567890");
  });

  it("collapses fullwidth ASCII digits via NFKC", () => {
    // U+FF11..U+FF19 ('１'..'９') are the fullwidth ASCII digits that
    // NFKC normalises to plain ASCII 1..9.
    expect(canonicalize("１２34５６789０")).toBe("1234567890");
  });

  it("returns an empty string for non-string input rather than throwing", () => {
    // The non-throwing form is for live UI validation, so it must be
    // safe to call with any junk while the user is mid-typing.
    expect(canonicalize(undefined as unknown as string)).toBe("");
    expect(canonicalize(null as unknown as string)).toBe("");
  });

  it("returns an empty string when input has no digits at all", () => {
    expect(canonicalize("abc-xyz")).toBe("");
  });
});

describe("isValidCypriotId", () => {
  it("accepts exactly 10 digits", () => {
    expect(isValidCypriotId("1234567890")).toBe(true);
    expect(CYPRIOT_ID_REGEX.test("1234567890")).toBe(true);
  });

  it("rejects fewer or more than 10 digits", () => {
    expect(isValidCypriotId("123456789")).toBe(false);
    expect(isValidCypriotId("12345678901")).toBe(false);
    expect(isValidCypriotId("")).toBe(false);
  });

  it("rejects any non-digit characters (the canonicalise step is what strips them)", () => {
    expect(isValidCypriotId("12345 67890")).toBe(false);
    expect(isValidCypriotId("123456789A")).toBe(false);
  });
});

describe("canonicalizeOrThrow", () => {
  it("returns the canonical form for valid input regardless of separators", () => {
    expect(canonicalizeOrThrow("12-34-56-78-90")).toBe("1234567890");
    expect(canonicalizeOrThrow(" 1234567890 ")).toBe("1234567890");
  });

  it("throws CypriotIdFormatError with a helpful message for invalid input", () => {
    expect(() => canonicalizeOrThrow("12345")).toThrow(CypriotIdFormatError);
    try {
      canonicalizeOrThrow("12345");
    } catch (e) {
      expect((e as Error).message).toMatch(/10 digits/);
    }
  });

  it("treats an empty/whitespace-only string as invalid (no derivation possible)", () => {
    expect(() => canonicalizeOrThrow("   ")).toThrow(CypriotIdFormatError);
  });
});
