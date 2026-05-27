// Browser DevTools helpers. Loaded for its side effect by main.tsx so
// that `window.cu` is available in the console for manual tweaks during
// thesis demos without needing to wire up new UI for each knob.
import {
  STORAGE_KEY,
  useAppStore,
  type AppState,
  type UiReport,
  type UiReward,
  type UiUser,
} from "./appStore";

type StoreSetter = Parameters<typeof useAppStore.setState>[0];

// "you" sentinel resolver shared by the promote/demote helpers. See
// the comment on `promoteToAdmin` below for the sentinel rules.
function resolveYouSentinel(username?: string): string | null {
  const sessionUsername = useAppStore.getState().username;
  const explicit = username ?? sessionUsername;
  if (!explicit) return null;
  if (explicit === "you" && sessionUsername && sessionUsername !== "you") {
    return sessionUsername;
  }
  return explicit;
}

// Deterministic-from-username citizen ID. djb2 hash → uint32 →
// zero-padded 10-digit string. Two cu.becomeUser calls with
// different usernames produce distinct identity nullifier hexes by
// default because identityNullifier = PBKDF2(canonicalCitizenId) is
// a pure function of the citizen ID. The output always passes
// canonicalizeOrThrow's /^\d{10}$/ check (uint32 max = 4 294 967 295
// = 10 digits; padStart handles smaller hashes).
function devCitizenIdFor(username: string): string {
  let h = 5381;
  for (let i = 0; i < username.length; i++) {
    h = ((h << 5) + h + username.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString().padStart(10, "0").slice(-10);
}

const api = {
  // Snapshot of the full live store state.
  state: () => useAppStore.getState(),

  // General escape hatch. Accepts either a partial object or a setter
  // function — same signature as Zustand's setState.
  // Example: cu.setState({ currentUserId: 3 })
  // Example: cu.setState((s) => ({ users: s.users.slice(0, 5) }))
  setState: (updater: StoreSetter) => useAppStore.setState(updater),

  // Patch the current user (or another user by id) — XP, streak,
  // username, avatar, etc.
  // Example: cu.patchUser({ xp: 2500 })
  // Example: cu.patchUser({ streak: 12 }, 4)
  patchUser: (patch: Partial<UiUser>, userId?: number) => {
    useAppStore.setState((s) => ({
      users: s.users.map((u) =>
        u.id === (userId ?? s.currentUserId) ? { ...u, ...patch } : u,
      ),
    }));
  },

  // Patch a reward by id. Example:
  //   cu.patchReward(1, { xpCost: 800, stock: 9 })
  patchReward: (rewardId: number, patch: Partial<UiReward>) => {
    useAppStore.setState((s) => ({
      rewards: s.rewards.map((r) =>
        r.id === rewardId ? { ...r, ...patch } : r,
      ),
    }));
  },

  // Patch a report by id. Examples:
  //   cu.patchReport(101, { status: "solved", difficulty: 5 })
  //   cu.patchReport(1, { rewardId: undefined })  // unlink the reward
  //
  // Throws if `reportId` is not in the store — a silent no-op would
  // pollute downstream state (popup picker, persisted snapshot) when
  // the demo operator mistypes an id. An explicit error makes the
  // mistake visible in the console.
  //
  // For `rewardId`, both `undefined` and `null` are treated as
  // "unlink": the key is fully removed from the report instead of
  // being left as `undefined`. This keeps the persisted JSON clean
  // (no `"rewardId": null` lingering in localStorage) and means the
  // `report.rewardId == null` branch in getRewardStatusForReport
  // falls through to the global-stock rule as intended.
  patchReport: (reportId: number, patch: Partial<UiReport>) => {
    const exists = useAppStore.getState().reports.some((r) => r.id === reportId);
    if (!exists) {
      throw new Error(
        `[cu] patchReport: no report with id=${reportId}. Use cu.state().reports to see valid ids.`,
      );
    }
    const unlinkReward = "rewardId" in patch && patch.rewardId == null;
    useAppStore.setState((s) => ({
      reports: s.reports.map((r) => {
        if (r.id !== reportId) return r;
        const next: UiReport = { ...r, ...patch };
        if (unlinkReward) delete next.rewardId;
        return next;
      }),
    }));
  },

  // Wipes persisted localStorage and reloads, so the next boot rehydrates
  // straight from the mockData seeds (current xpCost / image / users).
  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  },

  // Single-call shortcut to assume a user identity for demos.
  // Non-destructive by default — typo-grade calls cannot rewrite the
  // credential triple. Two modes selected by the second argument:
  //
  //   - Second argument OMITTED:
  //       cu.becomeUser("wreakage_fixer")
  //     Reuse path. If a credential triple is already persisted on
  //     disk for that exact username, flip `isAuthenticated: true`,
  //     align `currentUserId` to the matching users[] slot, and
  //     leave loginNullifier / ownershipPublicKey / identityNullifier
  //     untouched — re-login through the UI keeps working on the
  //     original password. If no credentials exist for that
  //     username, a console warning is logged and **no state is
  //     changed** — the caller can retry with an explicit password
  //     if they actually want to register.
  //
  //   - Second argument = an explicit PASSWORD string:
  //       cu.becomeUser("wreakage_fixer", "my_real_password")
  //     Full register through the store action — PBKDF2 nullifiers,
  //     Ed25519 ownership keypair, identity slice population, the
  //     register-time users[] sync. This OVERWRITES any previously
  //     stored credentials for the username; passing a password is
  //     the explicit consent signal.
  //
  // Third argument (rawCitizenId) defaults to a deterministic-from-
  // username 10-digit hash so two distinct usernames do not collide
  // on the same identity nullifier hex by default (the identity
  // derivation is a pure function of the citizen ID).
  becomeUser: async (
    username: string,
    password?: string,
    rawCitizenId: string = devCitizenIdFor(username),
  ) => {
    if (password === undefined) {
      const state = useAppStore.getState();
      if (
        state.username === username &&
        state.loginNullifier !== null &&
        state.ownershipPublicKey !== null
      ) {
        const slot = state.users.find((u) => u.username === username);
        useAppStore.setState({
          isAuthenticated: true,
          ...(slot ? { currentUserId: slot.id } : {}),
        });
        // eslint-disable-next-line no-console
        console.info(
          `[cu] reused stored credentials for "${username}". isAuthenticated=true; loginNullifier / ownershipPublicKey / identityNullifier untouched.`,
        );
        return { reused: true, registered: false, username };
      }
      // eslint-disable-next-line no-console
      console.warn(
        `[cu] no credentials persisted for "${username}" on this device — no state was changed. Retry with an explicit password to register: cu.becomeUser("${username}", "yourPassword").`,
      );
      return { reused: false, registered: false, username };
    }

    // Explicit-password path: full register. May overwrite prior
    // stored credentials for this username — that is the documented
    // contract of passing a password.
    return useAppStore.getState().register({ username, password, rawCitizenId });
  },

  // Identity-aware helpers — added when the admin DB view shipped.
  //
  // `promoteToAdmin(username?)` runs the properly-gated store action
  // (mock API POST + registry update + TOTP provision for self).
  // Defaults to the current session's username when called with no
  // argument. Returns the action's resolved value so the operator
  // can read the freshly-generated TOTP secret/URI from the console.
  //
  // Sentinel: the literal string "you" is treated as "the current
  // session" when a distinct session username is registered. There
  // IS a seed user named "you" (id=7, mockData.ts), so the sentinel
  // only kicks in when the session is some OTHER username (e.g. the
  // operator registered as "wreakage_fixer"). When no session is
  // active, "you" resolves to the literal seed user as before.
  promoteToAdmin: (username?: string) => {
    const target = resolveYouSentinel(username);
    if (!target) {
      throw new Error("No registered username on this device. Register first.");
    }
    return useAppStore.getState().promoteToAdmin(target);
  },

  // Inverse of promoteToAdmin via the properly-gated store action.
  // Resolves the "you" sentinel identically. When the target is the
  // session user, the store also resets role and adminVerified so
  // the admin views re-lock immediately.
  demoteFromAdmin: (username?: string) => {
    const target = resolveYouSentinel(username);
    if (!target) {
      throw new Error("No registered username on this device. Register first.");
    }
    return useAppStore.getState().demoteFromAdmin(target);
  },

  // Low-level role setter — bypasses the registry update and the
  // mock API call. Useful when you want to flip just the live
  // session's role without touching the users[] table.
  setRole: (role: "admin" | "citizen") => useAppStore.getState().setRole(role),

  // Inverse of devAdmin(): drops role back to "citizen" AND clears
  // the TOTP-passed flag so the admin views re-lock immediately on
  // the next render. Without the adminVerified reset, a session
  // that had previously passed the TOTP gate would still see admin
  // surfaces until a reload — surprising for the demo operator.
  demoteToCitizen: () => {
    useAppStore.getState().setRole("citizen");
    useAppStore.setState({ adminVerified: false });
  },

  // Dev-only one-shot admin bypass. Flips the live session to admin
  // AND marks the TOTP gate as already passed in a single synchronous
  // call so the operator can land on AdminDatabaseView without
  // running through register → promoteToAdmin → enrol → verify each
  // demo. Deliberately separate from `promoteToAdmin`: that action
  // remains the production-shaped authn/authz path and is unchanged.
  // Never reachable from the UI; only from the browser console.
  devAdmin: () => {
    useAppStore.getState().setRole("admin");
    useAppStore.setState({ adminVerified: true });
  },

  // Hard logout — same as the in-app Logout button, but reachable from
  // anywhere without navigating to a logout-bearing surface.
  logout: () => useAppStore.getState().logout(),

  // Direct access for power use: cu.store.subscribe(...), etc.
  store: useAppStore,
};

declare global {
  interface Window {
    cu: typeof api;
  }
}

if (typeof window !== "undefined") {
  window.cu = api;
  // eslint-disable-next-line no-console
  console.info(
    "[cu] dev console ready. Try: cu.state(), cu.patchUser({ xp: 2000 }), cu.patchReward(1, { xpCost: 800 }), cu.reset()",
  );
}

export type DevConsoleApi = typeof api;
export default api;
