import { describe, expect, it } from "vitest";
import {
  deriveIdentityNullifier,
  deriveLoginNullifier,
  deriveNullifiers,
} from "@/lib/identity";

// Two separate derivation properties are tested here, matching the
// post-security-fix split:
//
//   - identityNullifier ← PBKDF2(canonicalCitizenId, identity-salt)
//   - loginNullifier    ← PBKDF2(password,           login-salt+username)
//
// Determinism is the critical property: same input → same output
// across runs/devices/call sites. If determinism breaks for either
// derivation, registered users can no longer log in.

describe("deriveIdentityNullifier", () => {
  it("returns a 64-char hex string (256 bits)", async () => {
    const n = await deriveIdentityNullifier("1234567890");
    expect(n).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic, same citizen ID ⇒ same nullifier", async () => {
    const a = await deriveIdentityNullifier("1234567890");
    const b = await deriveIdentityNullifier("1234567890");
    expect(a).toBe(b);
  });

  it("changes when the citizen ID changes by even one digit", async () => {
    const a = await deriveIdentityNullifier("1234567890");
    const b = await deriveIdentityNullifier("1234567891");
    expect(a).not.toBe(b);
  });
});

describe("deriveLoginNullifier, password+username binding", () => {
  it("returns a 64-char hex string for any valid password/username pair", async () => {
    const n = await deriveLoginNullifier("hunter2", "alice");
    expect(n).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic, same (password, username) ⇒ same nullifier", async () => {
    const a = await deriveLoginNullifier("hunter2", "alice");
    const b = await deriveLoginNullifier("hunter2", "alice");
    expect(a).toBe(b);
  });

  it("USERNAME-BOUND: same password under a different username ⇒ different nullifier", async () => {
    // This is the contract that makes per-user PBKDF2 work without a
    // server-stored random salt. If this ever fails, two users with the
    // same password share a login credential, a catastrophic regression.
    const aliceN = await deriveLoginNullifier("hunter2", "alice");
    const bobN = await deriveLoginNullifier("hunter2", "bob");
    expect(aliceN).not.toBe(bobN);
  });

  it("PASSWORD-BOUND: same username with a different password ⇒ different nullifier", async () => {
    const correct = await deriveLoginNullifier("hunter2", "alice");
    const wrong = await deriveLoginNullifier("hunter3", "alice");
    expect(correct).not.toBe(wrong);
  });

  it("is domain-separated from the identity nullifier (different inputs AND different salts)", async () => {
    // Even if a user somehow chose their citizen ID as their password
    // (and "alice" happened to be the username), the two derivations
    // produce different values, the salt domain separation
    // ("crowdupkeep:v1:identity" vs "crowdupkeep:v2:login:alice")
    // guarantees it.
    const id = await deriveIdentityNullifier("1234567890");
    const login = await deriveLoginNullifier("1234567890", "alice");
    expect(id).not.toBe(login);
  });

  it("rejects no input length at the type level but produces a stable output for any string", async () => {
    // Implementation note: PBKDF2 itself accepts zero-length input. The
    // slice/UI is the layer that rejects empty passwords before calling
    // this function. We assert here that the lib stays consistent on
    // an edge input rather than throwing, defensive behaviour.
    const n = await deriveLoginNullifier("", "alice");
    expect(n).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("deriveNullifiers (parallel helper)", () => {
  it("returns both fields and matches the individual derivers", async () => {
    const pair = await deriveNullifiers({
      canonicalCitizenId: "5555555555",
      password: "hunter2",
      username: "alice",
    });
    const [id, login] = await Promise.all([
      deriveIdentityNullifier("5555555555"),
      deriveLoginNullifier("hunter2", "alice"),
    ]);
    expect(pair.identityNullifier).toBe(id);
    expect(pair.loginNullifier).toBe(login);
  });

  it("the two outputs are never equal for any plausible registration input", async () => {
    const pair = await deriveNullifiers({
      canonicalCitizenId: "0000000001",
      password: "p",
      username: "u",
    });
    expect(pair.identityNullifier).not.toBe(pair.loginNullifier);
  });
});
