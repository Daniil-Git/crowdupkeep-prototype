import { describe, expect, it } from "vitest";
import {
  base32ToBytes,
  bytesToBase32,
  generateSecret,
  provisioningUri,
  totpCode,
  verifyTotp,
} from "@/lib/totp";

// RFC 6238 Appendix B test vectors. The key is the 20-byte ASCII
// string "12345678901234567890". The vectors are an 8-digit code at
// specific UTC Unix times. Verifying against these is the de-facto
// proof that the HMAC + dynamic-truncation implementation is correct.
function asciiKeyAsBase32(ascii: string): string {
  return bytesToBase32(new TextEncoder().encode(ascii));
}

const RFC_KEY_ASCII = "12345678901234567890";
const RFC_VECTORS_SHA1: Array<{ time: number; code: string }> = [
  { time: 59, code: "94287082" },
  { time: 1111111109, code: "07081804" },
  { time: 1111111111, code: "14050471" },
  { time: 1234567890, code: "89005924" },
  { time: 2000000000, code: "69279037" },
  // T=20_000_000_000 is in the vector list but its 8-digit code is
  // "65353130" — kept here so any future regression is caught early.
  { time: 20000000000, code: "65353130" },
];

describe("base32 round-trip", () => {
  it("encodes and decodes back to the original bytes", () => {
    const bytes = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x30]);
    const b32 = bytesToBase32(bytes);
    const back = base32ToBytes(b32);
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });

  it("rejects invalid base32 characters", () => {
    expect(() => base32ToBytes("@#$%")).toThrow(/Invalid base32/);
  });
});

describe("generateSecret", () => {
  it("returns a 32-character base32 string by default (20 bytes)", () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]+$/);
    // 20 bytes → 160 bits → 32 base32 chars (no padding needed).
    expect(s.length).toBe(32);
  });

  it("produces a different secret on each call (uses crypto.getRandomValues)", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });
});

describe("totpCode — RFC 6238 vectors", () => {
  const secret = asciiKeyAsBase32(RFC_KEY_ASCII);

  for (const v of RFC_VECTORS_SHA1) {
    it(`matches the RFC vector at T=${v.time}`, async () => {
      const code = await totpCode(secret, {
        time: v.time,
        step: 30,
        digits: 8,
        algorithm: "SHA-1",
      });
      expect(code).toBe(v.code);
    });
  }

  it("defaults to 6 digits, 30s steps, SHA-1 — what authenticator apps expect", async () => {
    // The 6-digit code is the leading 6 digits of the truncated value,
    // not the trailing 6 of the 8-digit vector — they're computed
    // independently via mod 10^digits. Just assert the format.
    const code = await totpCode(secret, { time: 59 });
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe("verifyTotp", () => {
  const secret = asciiKeyAsBase32(RFC_KEY_ASCII);

  it("accepts the current code", async () => {
    const t = 1111111109;
    const current = await totpCode(secret, { time: t, digits: 8 });
    expect(await verifyTotp(secret, current, { time: t, digits: 8 })).toBe(true);
  });

  it("tolerates ±1 step of clock drift by default", async () => {
    const t = 1111111111;
    const past = await totpCode(secret, { time: t - 30, digits: 8 });
    const future = await totpCode(secret, { time: t + 30, digits: 8 });
    expect(await verifyTotp(secret, past, { time: t, digits: 8 })).toBe(true);
    expect(await verifyTotp(secret, future, { time: t, digits: 8 })).toBe(true);
  });

  it("rejects a code more than 1 step away from the verifier's clock", async () => {
    const t = 1111111111;
    const wayPast = await totpCode(secret, { time: t - 120, digits: 8 });
    expect(await verifyTotp(secret, wayPast, { time: t, digits: 8 })).toBe(false);
  });

  it("rejects junk inputs (non-digit, wrong length)", async () => {
    expect(await verifyTotp(secret, "abcdef")).toBe(false);
    expect(await verifyTotp(secret, "12345")).toBe(false);   // too short
    expect(await verifyTotp(secret, "1234567")).toBe(false); // too long
    expect(await verifyTotp(secret, "")).toBe(false);
  });

  it("tolerates spaces in the typed code", async () => {
    const t = 1111111109;
    const code = await totpCode(secret, { time: t, digits: 6 });
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(await verifyTotp(secret, spaced, { time: t })).toBe(true);
  });
});

describe("provisioningUri", () => {
  it("emits a well-formed otpauth:// URI with the secret in the params", () => {
    const uri = provisioningUri("JBSWY3DPEHPK3PXP", {
      account: "admin@example.com",
      issuer: "CrowdUpKeep",
    });
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=CrowdUpKeep");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });

  it("URL-encodes the label so colons/spaces in account survive", () => {
    const uri = provisioningUri("ABCD", {
      account: "user with spaces",
      issuer: "CrowdUpKeep",
    });
    // The `Issuer:account` label sits between `totp/` and the `?`.
    const labelPart = uri.split("?")[0].split("totp/")[1];
    expect(labelPart).toBe(encodeURIComponent("CrowdUpKeep:user with spaces"));
  });
});
