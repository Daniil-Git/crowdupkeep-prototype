// Identity & login nullifier derivation. Each nullifier is now
// derived from a *different* secret:
//
//   - identityNullifier := PBKDF2(canonicalCitizenId, APP_SALT_IDENTITY)
//                           A long-lived, cross-device identity binding.
//                           Reproducible from the citizen ID alone: same
//                           person, same value, any device.
//   - loginNullifier    := PBKDF2(password, APP_SALT_LOGIN + username)
//                           The auth credential. Username is folded into
//                           the salt so two users with the same password
//                           produce DIFFERENT login nullifiers, and so
//                           that knowing the password without the username
//                           is insufficient.
//
// This split fixes the "username-alone fast path" bug: login now
// strictly requires the password. The previous design used the citizen
// ID for both nullifiers, which let a cached loginNullifier authenticate
// on the username alone (since the citizen ID never had to be re-typed).
//
// PBKDF2 at 250 000 iterations is unchanged, same brute-force budget,
// applied to either the 10-digit citizen ID (identityNullifier) or the
// freely-chosen password (loginNullifier). For low-entropy PINs the
// 250 000 iterations are doing the heavy lifting; for high-entropy
// passwords they're an extra hardening layer on top of entropy.

const PBKDF2_ITERATIONS = 250_000;
const KEY_LENGTH_BITS = 256;

// Domain-separated salts. Versioned so a future migration can introduce
// fresh nullifier shapes without colliding with old ones. The trailing
// `:` on APP_SALT_LOGIN_PREFIX is load-bearing, it prevents a
// "username = empty string" from colliding with a legitimate username
// equal to whatever comes after the prefix.
const APP_SALT_IDENTITY = "crowdupkeep:v1:identity";
const APP_SALT_LOGIN_PREFIX = "crowdupkeep:v2:login:";

const enc = new TextEncoder();

async function pbkdf2(input: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(input),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    KEY_LENGTH_BITS,
  );
  return toHex(new Uint8Array(bits));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deriveIdentityNullifier(canonicalCitizenId: string): Promise<string> {
  return pbkdf2(canonicalCitizenId, APP_SALT_IDENTITY);
}

export async function deriveLoginNullifier(
  password: string,
  username: string,
): Promise<string> {
  // Username goes in the SALT, not the input, this is the standard
  // PBKDF2 pattern for per-user keys and keeps the password as the only
  // value being "stretched".
  return pbkdf2(password, APP_SALT_LOGIN_PREFIX + username);
}

export interface DeriveNullifiersInput {
  canonicalCitizenId: string;
  password: string;
  username: string;
}

export async function deriveNullifiers(input: DeriveNullifiersInput): Promise<{
  identityNullifier: string;
  loginNullifier: string;
}> {
  // The two derivations are independent, fire them in parallel so the
  // wall-clock cost on Register is one PBKDF2, not two.
  const [identityNullifier, loginNullifier] = await Promise.all([
    deriveIdentityNullifier(input.canonicalCitizenId),
    deriveLoginNullifier(input.password, input.username),
  ]);
  return { identityNullifier, loginNullifier };
}
