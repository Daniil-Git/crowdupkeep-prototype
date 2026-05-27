// Zustand slice for citizen-ID-derived auth + admin MFA enrolment.
//
// Persistence policy:
//   - identityNullifier, loginNullifier, username, isAuthenticated:
//     persisted to localStorage. Returning users on the same device
//     log in without re-entering their citizen ID (the cached
//     loginNullifier IS the bearer credential on this device).
//   - totpSecret: persisted for the thesis-prototype demo only. In a
//     real product the secret lives on the server (or in a hardware
//     authenticator) — the client only sends back the 6-digit code
//     being verified.
//
// Nothing in this slice ever holds a raw citizen ID. The `register`
// and `login` actions accept a `rawCitizenId` only as an input
// argument; canonicalisation + PBKDF2 happen inside, and only the
// derived nullifiers are passed to `set(...)`. The raw value falls out
// of scope as soon as the action returns.

import type { StateCreator } from "zustand";
import { canonicalizeOrThrow } from "@/lib/cypriotId";
import { deriveLoginNullifier, deriveNullifiers } from "@/lib/identity";
import {
  deriveOwnershipKeypair,
  generateAuthChallenge,
  signChallenge,
  verifySignature,
} from "@/lib/ownership";
import { generateSecret, provisioningUri, verifyTotp } from "@/lib/totp";

export interface IdentityState {
  username: string | null;
  identityNullifier: string | null;
  loginNullifier: string | null;
  isAuthenticated: boolean;

  // Role of the registered account. `null` until registration. Defaults
  // to "citizen" at register-time. Promotion to "admin" is an explicit
  // store action (`setRole`) — prototype-mode admin promotion lives in
  // the dev console; production would expose this only to a
  // backoffice surface holding its own auth gate.
  role: "admin" | "citizen" | null;

  // Public half of the deterministic Ed25519 keypair derived from
  // (password, username) at registration time. Stored as JWK-shaped
  // JSON so it survives the persist middleware without bespoke
  // serialisation. Used at login to verify the client's signature of
  // the server-issued challenge nonce — proving knowledge of the
  // password WITHOUT the server ever seeing the password.
  // The private half is never persisted: it is re-derived from the
  // typed credentials on each login attempt and falls out of scope as
  // soon as the action returns.
  ownershipPublicKey: string | null;

  // Admin MFA state.
  totpSecret: string | null;
  adminVerified: boolean;
}

export interface IdentityActions {
  register: (params: {
    username: string;
    password: string;
    rawCitizenId: string;
  }) => Promise<{ identityNullifier: string; loginNullifier: string }>;

  // Login takes ONLY username + password. The citizen ID is never
  // requested at login time — it was only needed once at registration
  // to derive the (separate) identityNullifier.
  login: (params: {
    username: string;
    password: string;
  }) => Promise<boolean>;

  // Session-only logout. Clears the access flags
  // (isAuthenticated, role, adminVerified) so any role-gated view
  // re-locks immediately, but DELIBERATELY preserves the credential
  // triple (username, loginNullifier, ownershipPublicKey) on disk so
  // a returning user can re-authenticate with username + password
  // without re-running the citizen-ID registration flow.
  // Trade-off: an attacker with localStorage access can still read
  // the persisted nullifier and public key after logout — those
  // alone are not sufficient to authenticate (the login path still
  // requires a fresh signature derived from the password), but the
  // earlier "wipe everything on logout" property is intentionally
  // dropped here for demo-ergonomics.
  logout: () => void;

  // Role promotion / demotion. `setRole` is the low-level escape
  // hatch (dev-console only); `promoteToAdmin` is the
  // properly-gated production-shaped action — caller is authn'd,
  // target exists in the registry, mock API simulates the
  // server-side authz/audit boundary, and the live session's TOTP
  // secret is provisioned if missing so the secondary gate is
  // reachable without an extra enrolment trip.
  setRole: (role: "admin" | "citizen") => void;
  promoteToAdmin: (username: string) => Promise<{
    promoted: string;
    totpEnrolment: { secret: string; uri: string } | null;
    alreadyAdmin: boolean;
  }>;
  // Mirror of promoteToAdmin: production-shaped action that flips a
  // user's role back to "citizen". When the target is the live
  // session user, the identity slice is also updated (role +
  // adminVerified) so the admin views re-lock immediately on the
  // next render pass without waiting for a reload. TOTP secret is
  // deliberately NOT touched — re-promotion should be able to reuse
  // the existing enrolled authenticator.
  demoteFromAdmin: (username: string) => Promise<{
    demoted: string;
    alreadyCitizen: boolean;
  }>;

  enrollTotp: (account: string) => Promise<{ secret: string; uri: string }>;
  verifyAdminTotp: (code: string) => Promise<boolean>;
  revokeAdmin: () => void;
}

export type IdentitySlice = IdentityState & IdentityActions;

export const TOTP_ISSUER = "CrowdUpKeep";

export const identityInitialState: IdentityState = {
  username: null,
  identityNullifier: null,
  loginNullifier: null,
  isAuthenticated: false,
  role: null,
  ownershipPublicKey: null,
  totpSecret: null,
  adminVerified: false,
};

// Mock secure API for admin promotion. Stand-in for
//   POST /admin/promote { username }
// with server-side authz on the caller's session. Returns the same
// shape a real server would; the actual data mutation happens in
// the action that wraps this call.
async function mockAdminPromoteApi(
  username: string,
  callerLoginNullifier: string | null,
): Promise<{ ok: true; username: string; promotedAt: string }> {
  if (!callerLoginNullifier) {
    throw new Error("Unauthorized: caller is not authenticated.");
  }
  // Small simulated latency so the awaiting code is exercised in
  // tests and the UI shows a brief "promoting…" state.
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { ok: true, username, promotedAt: new Date().toISOString() };
}

// Mock secure API for admin demotion. Stand-in for
//   POST /admin/demote { username }
// Same authz/latency shape as the promotion API.
async function mockAdminDemoteApi(
  username: string,
  callerLoginNullifier: string | null,
): Promise<{ ok: true; username: string; demotedAt: string }> {
  if (!callerLoginNullifier) {
    throw new Error("Unauthorized: caller is not authenticated.");
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { ok: true, username, demotedAt: new Date().toISOString() };
}

// Mock secure API for the login pre-flight. Stand-in for
//   GET /api/auth/challenge?username=...
// The server returns a fresh nonce REGARDLESS of whether the username
// exists — that's the anti-enumeration property. A caller probing
// "does <name> exist?" cannot tell from the response shape, size, or
// (modulo the simulated latency inside generateAuthChallenge) timing.
async function mockAuthChallengeApi(
  _username: string,
): Promise<{ challengeId: string; nonce: string }> {
  return generateAuthChallenge();
}

// Mock secure API for the login submission. Stand-in for
//   POST /api/auth/login { username, loginNullifier, challengeId, signatureHex }
// The "server" here is the local persisted store: it holds the
// (username, loginNullifier, ownershipPublicKey) tuple from
// registration. The signature is verified against that public key.
// Returns true on a verified match, false otherwise — the caller never
// sees which specific check failed, mirroring the anti-enumeration
// contract on the toast error in the Login component.
async function mockAuthLoginApi(params: {
  submittedUsername: string;
  submittedLoginNullifier: string;
  challengeNonceHex: string;
  signatureHex: string;
  storedUsername: string | null;
  storedLoginNullifier: string | null;
  storedOwnershipPublicKeyJwkJson: string | null;
}): Promise<boolean> {
  const {
    submittedUsername,
    submittedLoginNullifier,
    challengeNonceHex,
    signatureHex,
    storedUsername,
    storedLoginNullifier,
    storedOwnershipPublicKeyJwkJson,
  } = params;

  if (!storedUsername || !storedLoginNullifier) return false;
  if (storedUsername !== submittedUsername) return false;
  if (storedLoginNullifier !== submittedLoginNullifier) return false;

  // The ownership public key is the new gate. Without it, knowledge of
  // the nullifier alone (e.g. a stolen localStorage dump) cannot
  // authenticate — the caller must also be able to produce a fresh
  // Ed25519 signature over the challenge, which requires re-deriving
  // the private key from (password, username).
  if (!storedOwnershipPublicKeyJwkJson) return false;
  let publicKeyJwk: JsonWebKey;
  try {
    publicKeyJwk = JSON.parse(storedOwnershipPublicKeyJwkJson) as JsonWebKey;
  } catch {
    return false;
  }
  return verifySignature(publicKeyJwk, challengeNonceHex, signatureHex);
}

export const createIdentitySlice: StateCreator<IdentitySlice> = (set, get, store) => ({
  ...identityInitialState,

  register: async ({ username, password, rawCitizenId }) => {
    // canonicalizeOrThrow surfaces CypriotIdFormatError to the caller
    // so the UI can render a precise message. We never derive on
    // anything that doesn't pass the 10-digit format check.
    // Refuse empty/whitespace passwords — same shape as the citizen ID
    // check: derivation is mandatory and only fires on valid input.
    if (typeof password !== "string" || password.trim().length === 0) {
      throw new Error("Password is required for registration.");
    }
    if (typeof username !== "string" || username.trim().length === 0) {
      throw new Error("Username is required for registration.");
    }
    const canonical = canonicalizeOrThrow(rawCitizenId);
    // Run the nullifier derivations and the ownership keypair
    // derivation in parallel — they share no state and both block on
    // PBKDF2 inside WebCrypto, which is the slowest step.
    const [{ identityNullifier, loginNullifier }, ownership] = await Promise.all([
      deriveNullifiers({
        canonicalCitizenId: canonical,
        password,
        username,
      }),
      deriveOwnershipKeypair(password, username),
    ]);
    set({
      username,
      identityNullifier,
      loginNullifier,
      isAuthenticated: true,
      // New registrations default to "citizen". Admin promotion is a
      // separate, explicit action (`setRole("admin")`) that the admin
      // database view gates on.
      role: "citizen",
      // Persist the JWK as a string so the persist middleware doesn't
      // accidentally drop fields during JSON pass-through. Parsed back
      // at verify time inside mockAuthLoginApi.
      ownershipPublicKey: JSON.stringify(ownership.publicKeyJwk),
    });

    // Sync the gamification users[] table to the new identity so the
    // admin registry view, the "My Reports" list, and getCurrentUser()
    // all surface the same name instead of the pre-register
    // placeholder. Two cases:
    //   (a) The registered username matches an existing seed row —
    //       adopt that slot. currentUserId moves to the matching id;
    //       the slot's nullifier hex columns are overlaid with the
    //       real PBKDF2 outputs. The placeholder row at the old
    //       currentUserId is left alone.
    //   (b) The registered username does NOT match any seed row —
    //       overlay the slot at currentUserId in place. The
    //       placeholder username, email, nullifier hex, and role are
    //       all replaced with the registered values; reports whose
    //       createdByName was the placeholder are retro-fitted to
    //       the new username so the citizen's "My Reports" list
    //       shows their seeded reports as their own.
    set((state) => {
      const existing = state.users.find((u) => u.username === username);
      if (existing) {
        return {
          currentUserId: existing.id,
          users: state.users.map((u) =>
            u.id === existing.id
              ? {
                  ...u,
                  identityNullifierHex: identityNullifier,
                  loginNullifierHex: loginNullifier,
                }
              : u,
          ),
        } as Partial<typeof state>;
      }
      const slot = state.users.find((u) => u.id === state.currentUserId);
      if (!slot) return state;
      const prevUsername = slot.username;
      return {
        users: state.users.map((u) =>
          u.id === state.currentUserId
            ? {
                ...u,
                username,
                email: `${username}@limassol.cy`,
                identityNullifierHex: identityNullifier,
                loginNullifierHex: loginNullifier,
                role: "citizen",
              }
            : u,
        ),
        reports: state.reports.map((r) =>
          r.createdByName === prevUsername
            ? { ...r, createdByName: username }
            : r,
        ),
      } as Partial<typeof state>;
    });

    return { identityNullifier, loginNullifier };
  },

  login: async ({ username, password }) => {
    // Single, strict path. Both fields are required — no implicit
    // bypass on the username alone (the previous fast-path bug).
    if (
      typeof username !== "string" || username.length === 0 ||
      typeof password !== "string" || password.length === 0
    ) {
      return false;
    }

    // Step 1 — pre-flight challenge fetch. Returns a fresh nonce
    // regardless of whether the username exists. The fetch is fired
    // BEFORE any local-state branching so the on-wire shape and
    // (mock) timing don't differ between known / unknown users:
    // anti-enumeration in the wire protocol.
    const challenge = await mockAuthChallengeApi(username);

    // Step 2 — derive the (login nullifier, ownership keypair) tuple
    // from the typed credentials. Both derivations use PBKDF2 with
    // username as part of the salt; doing them in parallel keeps the
    // overall login latency ~ the slower of the two PBKDF2 rounds.
    let derivedLoginNullifier: string;
    let signatureHex: string;
    try {
      const [nullifier, keypair] = await Promise.all([
        deriveLoginNullifier(password, username),
        deriveOwnershipKeypair(password, username),
      ]);
      derivedLoginNullifier = nullifier;
      signatureHex = await signChallenge(keypair.privateKey, challenge.nonce);
    } catch {
      // Defensive: a WebCrypto failure here should reject, not throw,
      // so a caller probing for crashes can't distinguish "unknown
      // user" from "crypto blew up on input X".
      return false;
    }

    // Step 3 — submit { username, loginNullifier, challengeId,
    // signature } to the mock server. The server compares the
    // submitted nullifier to the stored one (cheap rejection on a
    // wrong password) and verifies the signature against the stored
    // ownership public key (the actual zero-knowledge proof). On a
    // real backend these are two server-side reads; here they're
    // closures over the persisted store state.
    const state = get();
    const verified = await mockAuthLoginApi({
      submittedUsername: username,
      submittedLoginNullifier: derivedLoginNullifier,
      challengeNonceHex: challenge.nonce,
      signatureHex,
      storedUsername: state.username,
      storedLoginNullifier: state.loginNullifier,
      storedOwnershipPublicKeyJwkJson: state.ownershipPublicKey,
    });

    if (!verified) return false;
    set({ isAuthenticated: true });
    return true;
  },

  logout: () => {
    // 1. Clear ONLY the session-scoped access flags. The credential
    //    triple (username, loginNullifier, ownershipPublicKey) and
    //    derived identity material (identityNullifier, totpSecret)
    //    are deliberately preserved in the persisted slice so a
    //    returning user can log in with username + password without
    //    re-running the citizen-ID registration flow. Trade-off is
    //    documented on the `logout` interface declaration above —
    //    this is a demo-ergonomics choice, not a security property.
    set({ isAuthenticated: false, role: null, adminVerified: false });

    // 2. Sweep sessionStorage. We don't intentionally write to it
    //    anywhere in this app, but third-party libs occasionally do —
    //    clearing on logout prevents an accidentally-leaked secret
    //    from outliving the session. Wrapped in try/catch for private
    //    mode browsers that throw on sessionStorage access.
    if (typeof sessionStorage !== "undefined") {
      try { sessionStorage.clear(); } catch { /* private mode */ }
    }

    // 3. Force a UI synchronization loop by hard-navigating to the
    //    login page (the index route at "/"). location.replace (vs
    //    navigate()) discards the current history entry so the back
    //    button can't return the user to a logged-in route, and a
    //    full page replace re-mounts every component so any
    //    React-internal state held by tree-deep memos / contexts is
    //    discarded along with the in-memory store handle. Guarded
    //    for non-browser environments (Vitest's default Node runner).
    //    After the reload, persist re-hydrates the preserved
    //    credentials from localStorage and the Login form can
    //    accept username + password directly.
    if (typeof window !== "undefined" && typeof window.location !== "undefined") {
      try { window.location.replace("/"); } catch { /* jsdom: navigation not implemented */ }
    }
  },

  setRole: (role) => set({ role }),

  promoteToAdmin: async (username) => {
    const state = get();

    // Caller authn: the prototype uses the live loginNullifier as the
    // session proxy. In production this would be the bearer token on
    // the request, validated server-side.
    if (!state.loginNullifier) {
      throw new Error("Must be logged in to promote users.");
    }

    // Resolve the target. Two cases are valid:
    //   (a) Target is in the seeded users[] array (the mock registry).
    //   (b) Target is the live session user but isn't in users[] —
    //       this happens when the operator registered with a username
    //       that doesn't match any seed (e.g. "wreakage_fixer"). The
    //       AdminDatabaseView's projection surfaces them via
    //       buildAnonymizedRegistry's append branch, so the table can
    //       target them; the action must accept that path too.
    // Anything else is a hard reject.
    const isSelf = state.username === username;
    const target = state.users.find((u) => u.username === username);
    if (!target && !isSelf) {
      throw new Error(`User "${username}" not found in registry.`);
    }

    // Idempotency: re-promoting an already-admin user is a no-op
    // success return. For session-only users the source of truth for
    // role is the identity slice (state.role); for users[] entries
    // it's the row's own role field.
    if (target && target.role === "admin") {
      return { promoted: username, totpEnrolment: null, alreadyAdmin: true };
    }
    if (!target && isSelf && state.role === "admin") {
      return { promoted: username, totpEnrolment: null, alreadyAdmin: true };
    }

    // Secure API mock POST. The actual mutation happens locally on the
    // line after — the API call is the authz/audit boundary in a real
    // product, not the persistence boundary.
    await mockAdminPromoteApi(username, state.loginNullifier);

    // 1. Update the users registry (mock database write). When the
    //    target isn't in users[] (the session-only case), the .map
    //    below is naturally a no-op and the registry stays as-is.
    set((s) => ({
      users: s.users.map((u) =>
        u.username === username ? { ...u, role: "admin" } : u,
      ),
    }));

    // 2. If we promoted the current session user, mirror the change
    //    into the identity slice so role-gated views (AdminDatabase
    //    View) see the new role immediately. Otherwise the change
    //    only lives in the users array — the promoted user picks it
    //    up on their own next login.
    let totpEnrolment: { secret: string; uri: string } | null = null;
    if (isSelf) {
      set({ role: "admin" });

      // 3. Provision the TOTP property so the promoted user can pass
      //    the secondary security gate. If they already have a
      //    secret enrolled, leave it alone — the existing one is
      //    still valid. If not, generate a fresh one and surface it
      //    to the caller so the UI can show the QR / URI for
      //    enrolment in an authenticator app. We do NOT auto-flip
      //    adminVerified — the user still has to scan the secret and
      //    enter a fresh code to actually unlock the gate.
      if (!state.totpSecret) {
        const secret = generateSecret();
        const uri = provisioningUri(secret, {
          account: username,
          issuer: TOTP_ISSUER,
        });
        set({ totpSecret: secret });
        totpEnrolment = { secret, uri };
      }
    }

    return { promoted: username, totpEnrolment, alreadyAdmin: false };
  },

  demoteFromAdmin: async (username) => {
    const state = get();

    // Same caller-authn gate as promoteToAdmin.
    if (!state.loginNullifier) {
      throw new Error("Must be logged in to demote users.");
    }

    // Same session-user tolerance: target may be in users[] OR may
    // be the live session user not present in the seeded registry.
    const isSelf = state.username === username;
    const target = state.users.find((u) => u.username === username);
    if (!target && !isSelf) {
      throw new Error(`User "${username}" not found in registry.`);
    }

    // Idempotency mirror of the promote path.
    if (target && target.role === "citizen") {
      return { demoted: username, alreadyCitizen: true };
    }
    if (!target && isSelf && state.role !== "admin") {
      return { demoted: username, alreadyCitizen: true };
    }

    await mockAdminDemoteApi(username, state.loginNullifier);

    // Mock-registry write — no-op when target isn't in users[].
    set((s) => ({
      users: s.users.map((u) =>
        u.username === username ? { ...u, role: "citizen" } : u,
      ),
    }));

    // Self-demotion path: reset role + adminVerified so the admin
    // views re-lock immediately. totpSecret is intentionally
    // preserved so a re-promotion later can reuse the existing
    // enrolled authenticator.
    if (isSelf) {
      set({ role: "citizen", adminVerified: false });
    }

    return { demoted: username, alreadyCitizen: false };
  },

  enrollTotp: async (account: string) => {
    const secret = generateSecret();
    const uri = provisioningUri(secret, { account, issuer: TOTP_ISSUER });
    set({ totpSecret: secret, adminVerified: false });
    return { secret, uri };
  },

  verifyAdminTotp: async (code: string) => {
    const secret = get().totpSecret;
    if (!secret) return false;
    const ok = await verifyTotp(secret, code);
    if (ok) set({ adminVerified: true });
    return ok;
  },

  revokeAdmin: () => set({ adminVerified: false, totpSecret: null }),
});
