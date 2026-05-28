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

// Deterministic citizen ID derived from a username: djb2 hash folded
// to a uint32 and zero-padded to ten digits. Used as a default by
// cu.becomeUser so two different usernames don't collide on the same
// identity nullifier (identityNullifier = PBKDF2(canonicalCitizenId)
// is a pure function of the ID). The output always satisfies the
// /^\d{10}$/ check in canonicalizeOrThrow (uint32 max is 10 digits).
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
  // function, same signature as Zustand's setState.
  // Example: cu.setState({ currentUserId: 3 })
  // Example: cu.setState((s) => ({ users: s.users.slice(0, 5) }))
  setState: (updater: StoreSetter) => useAppStore.setState(updater),

  // Patch the current user (or another user by id), XP, streak,
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
  // Throws if reportId is not in the store. A silent no-op would
  // pollute downstream state (popup picker, persisted snapshot) when
  // the operator mistypes an id; throwing makes the mistake visible.
  //
  // For rewardId, both undefined and null are treated as "unlink":
  // the key is fully removed from the report rather than left as
  // undefined. Keeps persisted JSON clean and lets the
  // report.rewardId == null branch in getRewardStatusForReport fall
  // through to the global-stock rule.
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

  // Shortcut to assume a user identity for demos. Non-destructive by
  // default: a typo can't overwrite the stored credential triple.
  //
  // Two modes, selected by the second argument:
  //
  //   cu.becomeUser("wreakage_fixer")
  //     Reuse path. If a credential triple is already persisted on
  //     disk for that username, flip isAuthenticated and align
  //     currentUserId to the matching users[] slot. The login
  //     nullifier, ownership public key, and identity nullifier stay
  //     as they were, so logging in through the UI still works on
  //     the original password. If nothing is persisted for that
  //     username, log a console warning and leave state untouched.
  //
  //   cu.becomeUser("wreakage_fixer", "my_real_password")
  //     Full register: derives PBKDF2 nullifiers, an Ed25519 ownership
  //     keypair, runs the register-time users[] sync. Will overwrite
  //     any existing credentials for the username; the password is
  //     the explicit consent signal.
  //
  // The optional third argument (rawCitizenId) defaults to a hash
  // of the username so two different usernames don't share an
  // identity nullifier hex by default.
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
        `[cu] no credentials persisted for "${username}" on this device, no state was changed. Retry with an explicit password to register: cu.becomeUser("${username}", "yourPassword").`,
      );
      return { reused: false, registered: false, username };
    }

    // Explicit-password path: full register. Overwrites prior stored
    // credentials for this username if any.
    return useAppStore.getState().register({ username, password, rawCitizenId });
  },

  // promoteToAdmin(username?) runs the gated store action (mock API
  // POST, registry update, TOTP provision for self) and returns the
  // action's resolved value so the operator can read the generated
  // TOTP secret/URI from the console. Defaults to the current
  // session's username when called with no argument.
  //
  // Passing the literal "you" is treated as "the current session"
  // when a session is active; with no session the sentinel resolves
  // to "you" as-is, and the underlying action will reject it since
  // there is no longer a seed user with that name (id=7 is
  // demo_user after the v8 scrub).
  promoteToAdmin: (username?: string) => {
    const target = resolveYouSentinel(username);
    if (!target) {
      throw new Error("No registered username on this device. Register first.");
    }
    return useAppStore.getState().promoteToAdmin(target);
  },

  // Inverse of promoteToAdmin via the gated store action. Same "you"
  // sentinel resolution. When the target is the session user, the
  // store also resets role and adminVerified so the admin views
  // re-lock immediately.
  demoteFromAdmin: (username?: string) => {
    const target = resolveYouSentinel(username);
    if (!target) {
      throw new Error("No registered username on this device. Register first.");
    }
    return useAppStore.getState().demoteFromAdmin(target);
  },

  // Low-level role setter, bypasses the registry update and the
  // mock API call. Useful when you want to flip just the live
  // session's role without touching the users[] table.
  setRole: (role: "admin" | "citizen") => useAppStore.getState().setRole(role),

  // Inverse of devAdmin(): drops role back to "citizen" AND clears
  // the TOTP-passed flag so the admin views re-lock immediately on
  // the next render. Without the adminVerified reset, a session
  // that had previously passed the TOTP gate would still see admin
  // surfaces until a reload, surprising for the demo operator.
  demoteToCitizen: () => {
    useAppStore.getState().setRole("citizen");
    useAppStore.setState({ adminVerified: false });
  },

  // Dev-only one-shot admin bypass. Flips the live session to admin
  // AND marks the TOTP gate as already passed in a single synchronous
  // call, then navigates to /admin so the operator lands directly on
  // the admin surface without the extra Profile → Admin Dashboard
  // (Demo) click. Deliberately separate from `promoteToAdmin`: that
  // action remains the production-shaped authn/authz path and is
  // unchanged. Never reachable from the UI; only from the browser
  // console.
  //
  // The window.location.assign call is guarded the same way logout()
  // is: jsdom (the Vitest environment) doesn't implement navigation
  // and throws on assign, the try/catch keeps the function safe to
  // exercise in unit tests, and the typeof checks keep it safe in
  // pure-Node environments.
  devAdmin: () => {
    useAppStore.getState().setRole("admin");
    useAppStore.setState({ adminVerified: true });
    if (typeof window !== "undefined" && typeof window.location !== "undefined") {
      try { window.location.assign("/admin"); } catch { /* jsdom: navigation not implemented */ }
    }
  },

  // Hard logout, same as the in-app Logout button, but reachable from
  // anywhere without navigating to a logout-bearing surface.
  logout: () => useAppStore.getState().logout(),

  // Re-upload the citizen ID for the live session. Rotates the
  // identity nullifier slot (current → previous, new → current).
  // Login credentials are NOT touched. Useful for demoing the
  // audit-history slot from the console:
  //   cu.reuploadIdentity("1234567890")           // first bind already done
  //   cu.reuploadIdentity("9876543210")           // rotates
  //   cu.state().previousIdentityNullifier         // = first hex
  //   cu.state().identityNullifier                  // = new hex
  reuploadIdentity: (rawCitizenId: string) =>
    useAppStore.getState().reuploadIdentity({ rawCitizenId }),

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
