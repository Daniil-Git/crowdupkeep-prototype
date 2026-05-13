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
