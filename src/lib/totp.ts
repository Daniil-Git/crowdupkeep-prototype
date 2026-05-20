// RFC 6238 TOTP via native WebCrypto HMAC.
//
// No external dependencies — secret generation, base32 encoding,
// HMAC, and dynamic truncation are all implemented below using
// `crypto.getRandomValues` + `crypto.subtle.sign`.
//
// Why SHA-1 by default? Compatibility with Google Authenticator /
// Authy / 1Password / Bitwarden — the `otpauth://` URI default is
// `algorithm=SHA1` and most authenticator apps either ignore the
// algorithm parameter or silently fail on SHA-256. SHA-1's
// cryptographic weaknesses are about collision resistance, not the
// HMAC PRF construction TOTP uses (HMAC-SHA1 is still considered
// safe — see RFC 6151). The `algorithm` option below is exposed
// for future migration.
//
// Constant-time string compare on the 6-digit code is overkill at
// this entropy level but cheap and correct — included so the
// pattern is right if someone copies this into a larger code base.

const DEFAULT_DIGITS = 6;
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_ALGORITHM = "SHA-1" as const;

export type TotpAlgorithm = "SHA-1" | "SHA-256" | "SHA-512";

// RFC 4648 base32 alphabet (no padding for our short secrets).
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0b11111];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0b11111];
  }
  return out;
}

export function base32ToBytes(b32: string): Uint8Array {
  const clean = b32.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = BASE32_ALPHABET.indexOf(ch);
    if (i < 0) throw new Error(`Invalid base32 character: ${ch}`);
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateSecret(byteLength = 20): string {
  // 20 bytes = 160 bits = native HMAC-SHA-1 key size; what Google
  // Authenticator and friends provision by default.
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase32(bytes);
}

function counterBytes(counter: number): Uint8Array {
  // 8-byte big-endian counter. JS numbers are 53-bit safe, well above
  // the foreseeable lifetime of any TOTP timestamp/30.
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter & 0xffffffff);
  return new Uint8Array(buf);
}

function dynamicTruncate(hmac: Uint8Array, digits: number): string {
  // RFC 4226 §5.4: pick a 4-byte window starting at offset (last
  // nibble of the HMAC), strip the top bit, then mod 10^digits.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = binary % 10 ** digits;
  return code.toString().padStart(digits, "0");
}

export interface TotpOptions {
  time?: number;       // unix seconds; defaults to now
  step?: number;       // seconds per step
  digits?: number;
  algorithm?: TotpAlgorithm;
}

export async function totpCode(secret: string, opts: TotpOptions = {}): Promise<string> {
  const time = opts.time ?? Math.floor(Date.now() / 1000);
  const step = opts.step ?? DEFAULT_STEP_SECONDS;
  const digits = opts.digits ?? DEFAULT_DIGITS;
  const algorithm = opts.algorithm ?? DEFAULT_ALGORITHM;
  const counter = Math.floor(time / step);

  const keyBytes = base32ToBytes(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, counterBytes(counter));
  return dynamicTruncate(new Uint8Array(sigBuf), digits);
}

export interface VerifyOptions extends TotpOptions {
  windowSteps?: number;  // ± steps tolerance for clock drift; default 1
}

export async function verifyTotp(
  secret: string,
  code: string,
  opts: VerifyOptions = {},
): Promise<boolean> {
  const trimmed = code.replace(/\s+/g, "");
  const digits = opts.digits ?? DEFAULT_DIGITS;
  // Reject anything that isn't exactly N digits before doing any
  // expensive HMAC work.
  if (!new RegExp(`^\\d{${digits}}$`).test(trimmed)) return false;

  const time = opts.time ?? Math.floor(Date.now() / 1000);
  const step = opts.step ?? DEFAULT_STEP_SECONDS;
  const window = opts.windowSteps ?? 1;

  // ±window steps to tolerate authenticator/device clock drift.
  // Beyond ±1 step the drift is more likely a typo or a stale code
  // than a real clock skew.
  for (let dt = -window; dt <= window; dt++) {
    const candidate = await totpCode(secret, {
      ...opts,
      time: time + dt * step,
    });
    if (constantTimeEq(candidate, trimmed)) return true;
  }
  return false;
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export interface ProvisioningOptions {
  account: string;
  issuer: string;
  algorithm?: "SHA1" | "SHA256" | "SHA512";   // URI form: no dash
  digits?: number;
  step?: number;
}

export function provisioningUri(secret: string, opts: ProvisioningOptions): string {
  // otpauth://totp/Issuer:account?secret=...&issuer=Issuer&algorithm=SHA1&digits=6&period=30
  const algorithm = opts.algorithm ?? "SHA1";
  const digits = opts.digits ?? DEFAULT_DIGITS;
  const period = opts.step ?? DEFAULT_STEP_SECONDS;
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret,
    issuer: opts.issuer,
    algorithm,
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
