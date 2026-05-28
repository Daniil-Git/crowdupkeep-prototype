// Zero-knowledge ownership proof.
//
// Two-step proof of password-knowledge that the server can verify
// WITHOUT ever seeing the password:
//
//   1. Registration:
//        seed = PBKDF2-SHA256(password, salt=username, 600_000 iter, 32 bytes)
//        keypair = Ed25519(seed)
//        server stores: publicKey (JWK)
//      The seed never leaves the client; only the public key is sent.
//
//   2. Login:
//        Client re-runs PBKDF2 with the same inputs → same seed → same
//        keypair. Server sends a random challenge nonce. Client signs
//        the nonce with the derived private key. Server verifies the
//        signature against the stored public key.
//
// Determinism: PBKDF2 is deterministic; Ed25519 derives the actual
// signing scalar from the seed via SHA-512 + clamping inside the
// WebCrypto implementation; Ed25519 signatures are deterministic
// (RFC 8032). So same (password, username) ⇒ same publicKey AND same
// signature for a given nonce. This is what lets the prototype work
// without any per-user random salt stored server-side.
//
// Why Ed25519 (vs ECDSA P-256)?
//   - Native deterministic signatures (no per-call random `k` needed)
//   - 32-byte private key seed maps directly via a short PKCS8 wrapper
//   - Curve-order range constraints are handled internally during the
//     scalar derivation, so any 32 random bytes are a valid seed.
//   - Supported in Node 22 + Chrome 113+ + Firefox 130+ + Safari 17+.

const ED25519_PBKDF2_ITERATIONS = 600_000;
const ED25519_SEED_BYTES = 32;

const enc = new TextEncoder();

// PKCS8 / RFC 8410 prefix for an Ed25519 private key. Layout:
//
//   30 2e                              SEQUENCE (46 bytes)
//     02 01 00                         INTEGER 0 (version)
//     30 05                            SEQUENCE (5)  AlgorithmIdentifier
//       06 03 2b 65 70                 OID 1.3.101.112 (id-Ed25519)
//     04 22                            OCTET STRING (34) privateKey
//       04 20                          OCTET STRING (32) Ed25519 seed
//       ... seed bytes go here ...
//
// 16-byte prefix + 32-byte seed = 48-byte PKCS8 blob.
const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e,
  0x02, 0x01, 0x00,
  0x30, 0x05,
  0x06, 0x03, 0x2b, 0x65, 0x70,
  0x04, 0x22,
  0x04, 0x20,
]);

function wrapAsEd25519Pkcs8(seed: Uint8Array): Uint8Array {
  if (seed.length !== ED25519_SEED_BYTES) {
    throw new Error(`Ed25519 seed must be ${ED25519_SEED_BYTES} bytes`);
  }
  const out = new Uint8Array(ED25519_PKCS8_PREFIX.length + ED25519_SEED_BYTES);
  out.set(ED25519_PKCS8_PREFIX, 0);
  out.set(seed, ED25519_PKCS8_PREFIX.length);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Hex string must have even length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export interface OwnershipKeypair {
  privateKey: CryptoKey;       // Ed25519, "sign" usage
  publicKey: CryptoKey;        // Ed25519, "verify" usage
  publicKeyJwk: JsonWebKey;    // Server-stored representation
}

export async function deriveOwnershipKeypair(
  password: string,
  username: string,
): Promise<OwnershipKeypair> {
  // 1. PBKDF2, username is the salt, password is the input. Minimum
  //    600 000 iterations per the spec; SHA-256 hash.
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const seedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(username),
      iterations: ED25519_PBKDF2_ITERATIONS,
    },
    passwordKey,
    ED25519_SEED_BYTES * 8,
  );
  const seed = new Uint8Array(seedBits);

  // 2. Wrap the seed as PKCS8 and import as an Ed25519 private key.
  //    WebCrypto's Ed25519 implementation handles the SHA-512 scalar
  //    derivation + clamping internally on each `sign` call.
  const pkcs8 = wrapAsEd25519Pkcs8(seed);
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    // TS 5.7+ narrows Uint8Array's generic; runtime shape is
    // unchanged, wrapAsEd25519Pkcs8 returns an ArrayBuffer-backed view.
    pkcs8 as BufferSource,
    { name: "Ed25519" },
    true,                          // extractable so we can export jwk for the public side
    ["sign"],
  );

  // 3. Extract the public key. WebCrypto computes it during import
  //    and exposes it via the JWK export, the `x` field is the
  //    public key bytes (base64url-encoded), `d` is the private seed.
  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (!privateJwk.x) {
    throw new Error("Ed25519 JWK is missing the public key component");
  }
  const publicKeyJwk: JsonWebKey = {
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
  };
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "Ed25519" },
    true,
    ["verify"],
  );

  return { privateKey, publicKey, publicKeyJwk };
}

export async function signChallenge(
  privateKey: CryptoKey,
  challengeHex: string,
): Promise<string> {
  const sig = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    hexToBytes(challengeHex) as BufferSource,
  );
  return bytesToHex(new Uint8Array(sig));
}

export async function verifySignature(
  publicKeyJwk: JsonWebKey,
  challengeHex: string,
  signatureHex: string,
): Promise<boolean> {
  // Defensive: malformed JWK or hex inputs should reject, not throw.
  try {
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicKeyJwk,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      publicKey,
      hexToBytes(signatureHex) as BufferSource,
      hexToBytes(challengeHex) as BufferSource,
    );
  } catch {
    return false;
  }
}

export interface AuthChallenge {
  challengeId: string;
  nonce: string;
}

export async function generateAuthChallenge(): Promise<AuthChallenge> {
  // 32-byte nonce, enough domain to make a precomputed signature
  // table infeasible across any realistic challenge corpus.
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  // 16-byte challenge id, enough to make collisions infeasible if
  // the server were tracking outstanding challenges to detect replay.
  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  // Simulate small network latency so async callers exercise the
  // await. Fixed timing, see anti-enumeration note in the slice.
  await new Promise((resolve) => setTimeout(resolve, 10));
  return {
    challengeId: bytesToHex(idBytes),
    nonce: bytesToHex(nonceBytes),
  };
}
