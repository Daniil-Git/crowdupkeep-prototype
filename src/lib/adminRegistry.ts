// Pure projection from the gamification user list + the live identity
// slice into the anonymized rows the admin database view renders.
//
// The point of factoring this out (vs inline useMemo inside the
// component) is testability: the projection has three branches —
// no session overlay, session overlays an existing seed row,
// session appends a brand-new row — and each is worth pinning down
// without mounting React.
//
// CRITICAL: the projection drops every field that is NOT one of the
// four anonymized columns (username, identityNullifierHex,
// loginNullifierHex, role). Email, XP, streak, avatar, location —
// none of them flow through. Removing this guard would re-leak PII
// into the admin surface.

import type { UiUser } from "@/app/store/appStore";

export interface AnonymizedRegistryRow {
  username: string;
  identityNullifierHex: string;
  loginNullifierHex: string;
  role: "admin" | "citizen";
}

export interface IdentitySessionInput {
  username: string | null;
  identityNullifier: string | null;
  loginNullifier: string | null;
  // Role of the live session — only used to set role on a newly-appended
  // row when the session user does not exist in the seed list. For an
  // overlay onto an existing row, the seed user's role is the one shown.
  role: "admin" | "citizen" | null;
}

export function buildAnonymizedRegistry(
  users: ReadonlyArray<UiUser>,
  session: IdentitySessionInput,
): AnonymizedRegistryRow[] {
  // Start with the seed users projected down to ONLY the anonymized
  // columns. Anything else from UiUser is intentionally dropped here.
  const rows: AnonymizedRegistryRow[] = users.map((u) => ({
    username: u.username,
    identityNullifierHex: u.identityNullifierHex,
    loginNullifierHex: u.loginNullifierHex,
    role: u.role,
  }));

  // No active session ⇒ nothing to overlay.
  if (
    session.username === null ||
    session.identityNullifier === null ||
    session.loginNullifier === null
  ) {
    return rows;
  }

  const existing = rows.findIndex((r) => r.username === session.username);
  if (existing >= 0) {
    // Overlay: replace the synthetic seed nullifiers for this username
    // with the real PBKDF2-derived values from the live identity slice.
    // The seed-user's role is preserved (the registry is authoritative
    // about role; the session's role field is only used for new rows).
    rows[existing] = {
      ...rows[existing],
      identityNullifierHex: session.identityNullifier,
      loginNullifierHex: session.loginNullifier,
    };
    return rows;
  }

  // Append: the registered username does not exist in the seed list.
  // This is the "fresh username at registration" case. The new row
  // inherits the session's role (or defaults to "citizen" if the
  // session role is null — should not happen post-register, but
  // defensive).
  rows.push({
    username: session.username,
    identityNullifierHex: session.identityNullifier,
    loginNullifierHex: session.loginNullifier,
    role: session.role ?? "citizen",
  });
  return rows;
}
