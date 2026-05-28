import { describe, expect, it } from "vitest";
import {
  deriveOwnershipKeypair,
  generateAuthChallenge,
  signChallenge,
  verifySignature,
} from "@/lib/ownership";

// The ownership keypair is the load-bearing primitive of the zero-
// knowledge login proof. The tests below pin down the four
// properties the login flow relies on:
//   1. Determinism, same (password, username) ⇒ same publicKey
//      ⇒ same signature for a given nonce. This is what lets the
//      prototype work without per-user random salts stored
//      server-side.
//   2. Round-trip, verifySignature accepts a fresh signature over
//      a fresh nonce.
//   3. Wrong-password rejection, verifySignature rejects a
//      signature made with a different password (the actual
//      authentication check, dressed up in asymmetric crypto).
//   4. Anti-replay shape, generateAuthChallenge produces fresh
//      hex-encoded values each call and never repeats.

describe("deriveOwnershipKeypair, determinism", () => {
  it("produces the same publicKeyJwk for the same (password, username) every time", async () => {
    const a = await deriveOwnershipKeypair("hunter2", "alice");
    const b = await deriveOwnershipKeypair("hunter2", "alice");
    // The JWK `x` field IS the public key bytes (base64url).
    expect(a.publicKeyJwk.x).toBeDefined();
    expect(a.publicKeyJwk.x).toBe(b.publicKeyJwk.x);
    expect(a.publicKeyJwk.kty).toBe("OKP");
    expect(a.publicKeyJwk.crv).toBe("Ed25519");
  });

  it("produces a DIFFERENT publicKey for a different password (same username)", async () => {
    const a = await deriveOwnershipKeypair("hunter2", "alice");
    const b = await deriveOwnershipKeypair("hunter3", "alice");
    expect(a.publicKeyJwk.x).not.toBe(b.publicKeyJwk.x);
  });

  it("produces a DIFFERENT publicKey for a different username (same password)", async () => {
    // Username is the PBKDF2 salt, so alice/hunter2 and bob/hunter2
    // derive distinct keypairs, exactly the property that lets us
    // get away without a per-user random salt server-side.
    const a = await deriveOwnershipKeypair("hunter2", "alice");
    const b = await deriveOwnershipKeypair("hunter2", "bob");
    expect(a.publicKeyJwk.x).not.toBe(b.publicKeyJwk.x);
  });

  it("produces a deterministic Ed25519 signature for a given (key, nonce)", async () => {
    // RFC 8032 mandates deterministic signatures. Two sign() calls
    // with the same key + same message must produce the same bytes.
    const { privateKey } = await deriveOwnershipKeypair("hunter2", "alice");
    const nonce = "00112233445566778899aabbccddeeff";
    const sigA = await signChallenge(privateKey, nonce);
    const sigB = await signChallenge(privateKey, nonce);
    expect(sigA).toBe(sigB);
    // Ed25519 signature is 64 bytes ⇒ 128 hex chars.
    expect(sigA).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe("signChallenge + verifySignature, round-trip", () => {
  it("verifies a fresh signature over a fresh nonce against the matching public key", async () => {
    const { privateKey, publicKeyJwk } = await deriveOwnershipKeypair("hunter2", "alice");
    const { nonce } = await generateAuthChallenge();
    const sig = await signChallenge(privateKey, nonce);
    expect(await verifySignature(publicKeyJwk, nonce, sig)).toBe(true);
  });

  it("REJECTS a signature made with a different password (wrong-password rejection)", async () => {
    // alice/hunter2 stores publicKey A. A login attempt with the
    // wrong password produces signature B from keypair B; verifying
    // B against A's publicKey must reject, that IS the password
    // check, dressed up as asymmetric crypto.
    const stored = await deriveOwnershipKeypair("hunter2", "alice");
    const attempt = await deriveOwnershipKeypair("WRONG-PASSWORD", "alice");
    const { nonce } = await generateAuthChallenge();
    const sigAttempt = await signChallenge(attempt.privateKey, nonce);
    expect(await verifySignature(stored.publicKeyJwk, nonce, sigAttempt)).toBe(false);
  });

  it("REJECTS a signature made under a different username (no cross-account replay)", async () => {
    // Same password, different username ⇒ different keypair, so a
    // signature produced as bob can't authenticate as alice even if
    // the password happens to match.
    const aliceStored = await deriveOwnershipKeypair("hunter2", "alice");
    const bobAttempt = await deriveOwnershipKeypair("hunter2", "bob");
    const { nonce } = await generateAuthChallenge();
    const sigBob = await signChallenge(bobAttempt.privateKey, nonce);
    expect(await verifySignature(aliceStored.publicKeyJwk, nonce, sigBob)).toBe(false);
  });

  it("REJECTS a tampered nonce (wrong message attacks fail)", async () => {
    const { privateKey, publicKeyJwk } = await deriveOwnershipKeypair("hunter2", "alice");
    const original = "00112233445566778899aabbccddeeff";
    const tampered = "00112233445566778899aabbccddee00"; // last byte flipped
    const sig = await signChallenge(privateKey, original);
    expect(await verifySignature(publicKeyJwk, tampered, sig)).toBe(false);
  });

  it("returns false (does not throw) for a malformed JWK", async () => {
    // Defensive: caller shouldn't need to wrap verifySignature in
    // a try/catch for invalid stored values, return false instead.
    const { privateKey } = await deriveOwnershipKeypair("hunter2", "alice");
    const { nonce } = await generateAuthChallenge();
    const sig = await signChallenge(privateKey, nonce);
    const ok = await verifySignature(
      { kty: "garbage", crv: "Ed25519", x: "not-a-real-key" },
      nonce,
      sig,
    );
    expect(ok).toBe(false);
  });

  it("returns false (does not throw) for malformed hex inputs", async () => {
    const { publicKeyJwk } = await deriveOwnershipKeypair("hunter2", "alice");
    const ok = await verifySignature(publicKeyJwk, "not-hex", "also-not-hex");
    expect(ok).toBe(false);
  });
});

describe("generateAuthChallenge, anti-replay shape", () => {
  it("produces a 64-hex-char nonce and 32-hex-char challengeId", async () => {
    const c = await generateAuthChallenge();
    expect(c.nonce).toMatch(/^[0-9a-f]{64}$/);    // 32 bytes
    expect(c.challengeId).toMatch(/^[0-9a-f]{32}$/); // 16 bytes
  });

  it("produces fresh values on each call (no repeats)", async () => {
    const calls = await Promise.all(
      Array.from({ length: 8 }, () => generateAuthChallenge()),
    );
    const nonces = new Set(calls.map((c) => c.nonce));
    const ids = new Set(calls.map((c) => c.challengeId));
    expect(nonces.size).toBe(8);
    expect(ids.size).toBe(8);
  });
});
