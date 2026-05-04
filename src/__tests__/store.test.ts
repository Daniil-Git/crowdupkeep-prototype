import { describe, expect, it, beforeEach } from "vitest";
import { useAppStore } from "@/app/store/appStore";
import { hasNearbyReport, pickNearbyReport } from "@/lib/nearby";
import { ALL_LOCATIONS, addressToDistrict } from "@/lib/districts";
import { proximityRewardLabel } from "@/app/components/NotificationOverlay";

// The Zustand store is the in-memory mirror of the persistent layer. Reset it
// between cases so each test sees a fresh seed. With persist middleware
// wrapping the store we also clear its persisted layer to keep state clean.
const resetStore = () => {
  useAppStore.persist.clearStorage();
  useAppStore.setState(useAppStore.getInitialState(), true);
};

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

  it("addReport({ district }) auto-anchors geometry + address to that district", () => {
    const created = useAppStore.getState().addReport({
      title: "Auto-linked report",
      description: "Filed via the district dropdown",
      difficulty: 3,
      district: "Old Port",
      photo: null,
    });
    // The new pin's address must be matchable by the same regexes the
    // citizen and admin filters use — otherwise a citizen filing under
    // "Old Port" wouldn't see their own report when the filter is on.
    expect(addressToDistrict(created.address)).toBe("Old Port");
    // Geometry should land in the Old Port anchor zone, not at the
    // generic LIMASSOL_CENTER fallback.
    expect(created.geometry.lat).toBeGreaterThan(34.65);
    expect(created.geometry.lat).toBeLessThan(34.69);
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

  it("exposes a persistence handle so refresh can rehydrate state", () => {
    // The persist middleware attaches a `persist` namespace with hydration
    // helpers. App.tsx relies on these to gate the route tree on hydration.
    expect(typeof useAppStore.persist.hasHydrated).toBe("function");
    expect(typeof useAppStore.persist.onFinishHydration).toBe("function");
    expect(typeof useAppStore.persist.clearStorage).toBe("function");
  });

  it("defaults selectedDistrict to All Locations", () => {
    expect(useAppStore.getState().selectedDistrict).toBe(ALL_LOCATIONS);
  });

  it("setSelectedDistrict updates the store synchronously", () => {
    useAppStore.getState().setSelectedDistrict("Molos");
    expect(useAppStore.getState().selectedDistrict).toBe("Molos");
    useAppStore.getState().setSelectedDistrict("Old Port");
    expect(useAppStore.getState().selectedDistrict).toBe("Old Port");
  });

  it("includes selectedDistrict in the persisted partition", () => {
    // The partialize config decides what survives a refresh. Without the
    // district being persisted, the user would lose their filter on every
    // reload — exactly the regression we just fixed.
    useAppStore.getState().setSelectedDistrict("Dasoudi");
    const persistOptions = (useAppStore.persist as unknown as {
      getOptions: () => { partialize?: (s: unknown) => Record<string, unknown> };
    }).getOptions();
    const partial = persistOptions.partialize?.(useAppStore.getState());
    expect(partial).toBeDefined();
    expect(partial!.selectedDistrict).toBe("Dasoudi");
  });
});

describe("getRewardStatusForReport", () => {
  it("returns xpFor(difficulty) credits and 'available' for an open report when stock exists", () => {
    const report = useAppStore.getState().reports.find((r) => r.id === 1)!;
    const status = useAppStore.getState().getRewardStatusForReport(report.id);
    expect(status).not.toBeNull();
    expect(status!.xpCost).toBe(report.difficulty * 50);
    expect(status!.stock).toBeGreaterThan(0);
    expect(status!.available).toBe(true);
  });

  it("flags a report as not available once it is solved", () => {
    const solvedReport = useAppStore.getState().reports.find((r) => r.status === "solved")!;
    const status = useAppStore.getState().getRewardStatusForReport(solvedReport.id);
    expect(status!.available).toBe(false);
  });

  it("flags a report as not available when reward inventory is exhausted", () => {
    // Drain every reward's stock; the popup should switch to its
    // "challenge only" copy because earning XP can't be redeemed.
    useAppStore.setState((s) => ({
      rewards: s.rewards.map((r) => ({ ...r, stock: 0 })),
    }));
    const report = useAppStore.getState().reports.find((r) => r.status !== "solved")!;
    const status = useAppStore.getState().getRewardStatusForReport(report.id);
    expect(status!.available).toBe(false);
    expect(status!.stock).toBe(0);
  });

  it("returns null for an unknown report id", () => {
    const status = useAppStore.getState().getRewardStatusForReport(999_999);
    expect(status).toBeNull();
  });

  it("accepts a string id (for params arriving from useParams())", () => {
    const status = useAppStore.getState().getRewardStatusForReport("1");
    expect(status).not.toBeNull();
  });
});

describe("hasNearbyReport (popup gating)", () => {
  // The Dashboard trigger and the NotificationOverlay render gate both
  // route through this predicate. If it returns false, the popup must not
  // open in the first place and must not render its default copy if it
  // somehow did open. These cases pin down both branches.

  it("returns false when there are no pending reports for the active district", () => {
    // Force every seed report into a non-pending status so no candidate
    // can survive the picker's filter, regardless of which district is
    // active. This is the "popup must stay closed" scenario.
    useAppStore.setState((s) => ({
      reports: s.reports.map((r) => ({ ...r, status: "solved" as const })),
    }));
    const s = useAppStore.getState();
    expect(hasNearbyReport(s.reports, { lat: 34.7, lng: 33.02 }, "Old Port")).toBe(false);
    expect(hasNearbyReport(s.reports, { lat: 34.7, lng: 33.02 }, "Centre")).toBe(false);
    expect(hasNearbyReport(s.reports, { lat: 34.7, lng: 33.02 }, ALL_LOCATIONS)).toBe(false);
  });

  it("returns false on an empty report list, with or without an origin", () => {
    expect(hasNearbyReport([], undefined, ALL_LOCATIONS)).toBe(false);
    expect(hasNearbyReport([], { lat: 0, lng: 0 }, "Centre")).toBe(false);
  });

  it("returns true when at least one pending report exists for the active district", () => {
    const s = useAppStore.getState();
    // Old Port has the seeded "Overflowing Trash Bin" pending report.
    expect(hasNearbyReport(s.reports, { lat: 34.7, lng: 33.02 }, "Old Port")).toBe(true);
    expect(hasNearbyReport(s.reports, { lat: 34.7, lng: 33.02 }, ALL_LOCATIONS)).toBe(true);
  });

  it("flips to false when the active district is filtered to a region with no pending reports", () => {
    const s = useAppStore.getState();
    // Drop every Old Port report; keep the rest. Old Port should now be
    // empty for the picker even though other districts still have work.
    useAppStore.setState({
      reports: s.reports.filter((r) => addressToDistrict(r.address) !== "Old Port"),
    });
    const after = useAppStore.getState();
    expect(hasNearbyReport(after.reports, { lat: 34.7, lng: 33.02 }, "Old Port")).toBe(false);
    expect(hasNearbyReport(after.reports, { lat: 34.7, lng: 33.02 }, ALL_LOCATIONS)).toBe(true);
  });
});

describe("proximityRewardLabel", () => {
  it("falls back to a 'challenge' label when no reward status is supplied", () => {
    expect(proximityRewardLabel(150, null)).toBe("+150 XP challenge");
  });

  it("uses 'challenge' copy when the status is unavailable", () => {
    expect(
      proximityRewardLabel(150, { xpCost: 150, available: false, stock: 0 }),
    ).toBe("+150 XP challenge");
  });

  it("renders the standard '+XP + reward' phrase when xp matches xpCost", () => {
    expect(
      proximityRewardLabel(200, { xpCost: 200, available: true, stock: 4 }),
    ).toBe("+200 XP + reward");
  });

  it("prefers the store-side xpCost when xp and xpCost diverge", () => {
    // Defensive: if the store ever reports a different number than the
    // pure helper computed, the popup should display the authoritative
    // store value rather than silently disagree with the leaderboard.
    expect(
      proximityRewardLabel(150, { xpCost: 250, available: true, stock: 4 }),
    ).toBe("+250 XP + reward");
  });
});

describe("pickNearbyReport (lib/nearby)", () => {
  it("returns the closest pending report to the user", () => {
    const here = { lat: 34.7071, lng: 33.0226 };
    // Reuse the seed reports — they're guaranteed to include several
    // pending Limassol-area issues.
    const reports = useAppStore.getState().reports;
    const picked = pickNearbyReport(reports, here);
    expect(picked).not.toBeNull();
    if (!picked || !("report" in picked)) throw new Error("expected near-result");
    expect(picked.report.status).toBe("pending");
    // Distance should be small for Limassol-centred seed data.
    expect(picked.distanceKm).toBeLessThan(20);
  });

  it("falls back to the first pending report when no origin is known", () => {
    const reports = useAppStore.getState().reports;
    const picked = pickNearbyReport(reports, undefined);
    expect(picked).not.toBeNull();
    // No distance metadata when origin is missing.
    if (picked && "report" in picked) {
      throw new Error("did not expect distance metadata");
    }
  });

  it("returns null when there are no pending reports", () => {
    const picked = pickNearbyReport([], { lat: 0, lng: 0 });
    expect(picked).toBeNull();
  });

  it("respects the active district filter when picking nearby", () => {
    const here = { lat: 34.7071, lng: 33.0226 };
    const reports = useAppStore.getState().reports;
    const picked = pickNearbyReport(reports, here, "Old Port");
    if (!picked || !("report" in picked)) {
      throw new Error("expected an Old Port report");
    }
    expect(picked.report.address.toLowerCase()).toContain("old port");
  });

  it("returns null when the active district filter excludes every pending report", () => {
    const here = { lat: 34.7071, lng: 33.0226 };
    // Force every seeded report into a status that won't match the picker's
    // 'pending' constraint, so we exercise the empty-candidates branch even
    // when a district filter is supplied.
    const reports = useAppStore.getState().reports.map((r) => ({
      ...r,
      status: "solved" as const,
    }));
    const picked = pickNearbyReport(reports, here, "Old Port");
    expect(picked).toBeNull();
  });
});
