// Canonicalisation + format validation for Cypriot national IDs.
//
// We never feed raw user input to the cryptographic pipeline, instead
// the input is normalised down to "exactly 10 digits" (the Cypriot ID
// format we target) so that:
//
//   - "AB-12 345 67890"   → "1234567890"   (separator-tolerant)
//   - "  1234567890   "   → "1234567890"   (whitespace-tolerant)
//   - typed input vs photographed-then-typed input
//     both produce identical canonical strings and therefore identical
//     hashes downstream.
//
// `canonicalizeOrThrow` is the strict entry point, callers from the
// crypto path use it so they can never accidentally derive a nullifier
// from invalid input. The non-throwing `canonicalize` + `isValidCypriotId`
// pair is for UI live-validation (every keystroke).

export const CYPRIOT_ID_REGEX = /^\d{10}$/;

export class CypriotIdFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CypriotIdFormatError";
  }
}

export function canonicalize(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw
    .normalize("NFKC")         // collapse fullwidth/compat digits to ASCII
    .replace(/\s+/g, "")       // drop spaces of every flavour
    .replace(/[^0-9]/g, "");   // strip separators / letters / punctuation
}

export function isValidCypriotId(canonical: string): boolean {
  return CYPRIOT_ID_REGEX.test(canonical);
}

export function canonicalizeOrThrow(raw: string): string {
  const c = canonicalize(raw);
  if (!isValidCypriotId(c)) {
    throw new CypriotIdFormatError(
      "Cypriot national ID must be exactly 10 digits (spaces and dashes are OK and will be stripped).",
    );
  }
  return c;
}
