import { describe, expect, it, beforeEach } from "vitest";
import { useAppStore } from "@/app/store/appStore";

// The Zustand store is the in-memory mirror of the persistent layer. Reset it
// between cases so each test sees a fresh seed.
const resetStore = () => useAppStore.setState(useAppStore.getInitialState());

beforeEach(() => {
  resetStore();
});

describe("useAppStore", () => {
  it("seeds with Limassol-resident users and reports", () => {
    const { users, reports } = useAppStore.getState();
    expect(users.length).toBeGreaterThan(0);
    expect(reports.length).toBeGreaterThan(0);
    // Limassol latitudes ≈ 34.7
    for (const r of reports) {
      expect(r.geometry.lat).toBeGreaterThan(34);
      expect(r.geometry.lat).toBeLessThan(36);
    }
  });

  it("addReport prepends the new report", () => {
    const before = useAppStore.getState().reports.length;
    const created = useAppStore.getState().addReport({
      title: "Test report",
      description: "desc",
      difficulty: 2,
      geometry: { lat: 34.7, lng: 33.02 },
      photo: null,
    });
    const after = useAppStore.getState().reports;
    expect(after.length).toBe(before + 1);
    expect(after[0].id).toBe(created.id);
    expect(after[0].title).toBe("Test report");
  });

  it("addComment supports nested replies via parentId", () => {
    const reportId = useAppStore.getState().reports[0].id;
    useAppStore.getState().addComment({ reportId, text: "hello" });
    const root = useAppStore.getState().reports.find((r) => r.id === reportId)!.comments.at(-1)!;
    useAppStore.getState().addComment({ reportId, text: "reply", parentId: root.id });
    const updated = useAppStore.getState().reports.find((r) => r.id === reportId)!;
    const reply = updated.comments.at(-1)!;
    expect(reply.parentId).toBe(root.id);
  });

  it("acceptSolution awards difficulty * 50 XP and flips report to solved", () => {
    const state = useAppStore.getState();
    // Use the seeded report 3 (in-progress, difficulty 4) — add a solution first.
    const reportId = state.reports.find((r) => r.id === 3)!.id;
    state.addSolution({ reportId, description: "Fixed", proofPhoto: null });

    const before = useAppStore.getState();
    const sol = before.reports.find((r) => r.id === reportId)!.solutions.at(-1)!;
    const meXpBefore = before.getCurrentUser().xp;

    const result = state.acceptSolution(reportId, sol.id);
    expect(result?.xpAwarded).toBe(4 * 50);

    const after = useAppStore.getState();
    const reportAfter = after.reports.find((r) => r.id === reportId)!;
    expect(reportAfter.status).toBe("solved");
    expect(reportAfter.solutions.find((s) => s.id === sol.id)?.status).toBe("accepted");
    // The current user authored the solution (addSolution uses the current
    // user) so their XP should have grown.
    expect(after.getCurrentUser().xp).toBe(meXpBefore + 200);
  });

  it("redeemReward debits XP, decrements stock, and stores the voucher", () => {
    const state = useAppStore.getState();
    const reward = state.rewards.find((r) => r.xpCost <= state.getCurrentUser().xp)!;
    const xpBefore = state.getCurrentUser().xp;
    const stockBefore = reward.stock;
    const voucher = state.redeemReward(reward.id);
    expect(voucher).not.toBeNull();
    const after = useAppStore.getState();
    expect(after.getCurrentUser().xp).toBe(xpBefore - reward.xpCost);
    expect(after.rewards.find((r) => r.id === reward.id)!.stock).toBe(stockBefore - 1);
    expect(after.redeemedVouchers[0].code).toBe(voucher!.code);
  });

  it("redeemReward refuses when the user can't afford it", () => {
    useAppStore.setState((s) => ({
      users: s.users.map((u) => (u.id === s.currentUserId ? { ...u, xp: 0 } : u)),
    }));
    const reward = useAppStore.getState().rewards[0];
    const result = useAppStore.getState().redeemReward(reward.id);
    expect(result).toBeNull();
  });

  it("banUser is idempotent", () => {
    const { banUser } = useAppStore.getState();
    banUser("foo");
    banUser("foo");
    banUser("bar");
    expect(useAppStore.getState().bannedUsernames).toEqual(["foo", "bar"]);
  });
});
