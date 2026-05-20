import { describe, expect, it, beforeEach } from "vitest";
import {
  STORAGE_VERSION,
  freshSeedState,
  migrateState,
  useAppStore,
} from "@/app/store/appStore";
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
  // Helper: find the first pending seed report that is *not* linked to
  // a specific reward, so it exercises the global-inventory fallback
  // branch instead of the new per-report `rewardId` branch.
  const firstUnlinkedPending = () =>
    useAppStore.getState().reports.find(
      (r) => r.status === "pending" && r.rewardId == null,
    )!;

  it("returns xpFor(difficulty) credits and 'available' for an unlinked pending report when global stock exists", () => {
    const report = firstUnlinkedPending();
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

  it("flags an unlinked report as not available when global reward inventory is exhausted", () => {
    // Drain every reward's stock; the popup should switch to its
    // "challenge only" copy because earning XP can't be redeemed.
    useAppStore.setState((s) => ({
      rewards: s.rewards.map((r) => ({ ...r, stock: 0 })),
    }));
    const report = firstUnlinkedPending();
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

  // --- Per-report rewardId linkage (new in v4) ----------------------

  it("uses the linked reward's stock alone when a report has a rewardId, ignoring global inventory", () => {
    // Seed report id 1 is linked to reward id 5 (Pizza Hut, stock: 0).
    // Other rewards (Cyta / IKEA / etc.) hold plenty of stock, but
    // that should not bleed through — a per-report link is meant to
    // pin the popup to that specific reward's availability.
    const status = useAppStore.getState().getRewardStatusForReport(1);
    expect(status).not.toBeNull();
    expect(status!.stock).toBe(0);
    expect(status!.available).toBe(false);
  });

  it("flips a linked report back to available when its linked reward is restocked", () => {
    useAppStore.setState((s) => ({
      rewards: s.rewards.map((r) =>
        r.id === 5 ? { ...r, stock: 3 } : r,
      ),
    }));
    const status = useAppStore.getState().getRewardStatusForReport(1);
    expect(status!.stock).toBe(3);
    expect(status!.available).toBe(true);
  });

  it("falls back to global stock when the linked rewardId points at a missing reward (stale link)", () => {
    // Simulate a half-broken state: a report holds a stale rewardId
    // that no longer exists in the catalogue. The popup should not
    // crash — it should degrade to the global-inventory rule so the
    // user still sees a sensible state.
    useAppStore.setState((s) => ({
      reports: s.reports.map((r) =>
        r.id === 4 ? { ...r, rewardId: 9999 } : r,
      ),
    }));
    const status = useAppStore.getState().getRewardStatusForReport(4);
    expect(status).not.toBeNull();
    expect(status!.stock).toBeGreaterThan(0);
    expect(status!.available).toBe(true);
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

describe("seed catalogue (v4 invariants)", () => {
  // These pin down the shape contract the Nearby popup + dev console
  // were built against. If any of them drift, the persist version
  // should bump and the migrate function should rehydrate.

  it("ends the rewards array with the 0-stock Pizza Hut voucher and a unique image", () => {
    const { rewards } = useAppStore.getState();
    const last = rewards[rewards.length - 1];
    expect(last.id).toBe(5);
    expect(last.title).toBe("Pizza Hut €20 Voucher");
    expect(last.stock).toBe(0);
    // Image URL must not duplicate any other entry — verifying it in
    // the seed prevents an easy copy-paste regression where two
    // rewards share the same Unsplash photo.
    const otherUrls = rewards.slice(0, -1).map((r) => r.imageUrl);
    expect(otherUrls).not.toContain(last.imageUrl);
  });

  it("links pending report id 1 to the 0-stock Pizza Hut voucher (id 5)", () => {
    const report = useAppStore.getState().reports.find((r) => r.id === 1)!;
    expect(report.status).toBe("pending");
    expect(report.rewardId).toBe(5);
  });

  it("makes report 1 reliably surface the 'XP challenge' label via proximityRewardLabel", () => {
    const status = useAppStore.getState().getRewardStatusForReport(1)!;
    const label = proximityRewardLabel(status.xpCost, status);
    expect(label).toBe(`+${status.xpCost} XP challenge`);
  });

  it("pickNearbyReport(All Locations, no origin) lands on the linked report 1", () => {
    // The Dashboard's first-load case: no geolocation yet, no district
    // filter active. The picker should hand back report 1, which is
    // exactly the report wired to surface the XP-challenge branch.
    const reports = useAppStore.getState().reports;
    const picked = pickNearbyReport(reports, undefined, ALL_LOCATIONS);
    expect(picked).not.toBeNull();
    // No origin → bare candidate, no distance wrapper.
    if (picked && "report" in picked) {
      throw new Error("did not expect distance metadata");
    }
    expect((picked as { id: number }).id).toBe(1);
  });

  it("Old Port pending report stays available (other districts unaffected by report 1's link)", () => {
    // Sanity: linking report 1 to an out-of-stock reward must not
    // accidentally drag other districts' reports into "unavailable".
    const oldPort = useAppStore.getState().reports.find(
      (r) => r.address.toLowerCase().includes("old port") && r.status === "pending",
    )!;
    const status = useAppStore.getState().getRewardStatusForReport(oldPort.id)!;
    expect(status.available).toBe(true);
  });
});

describe("persist migrate (v7 — ownership-key wipe for the zero-knowledge proof rollout)", () => {
  // The migrate function is the only way persisted snapshots from
  // earlier devConsole / catalogue shapes get cleaned up on a real
  // user's browser. Exercising it directly is the cheap way to keep
  // it honest without spelunking through Zustand's internal hydrate.

  it("STORAGE_VERSION is the current target", () => {
    expect(STORAGE_VERSION).toBe(7);
  });

  it("freshSeedState returns the canonical 'just installed' snapshot (incl. identity defaults)", () => {
    const seed = freshSeedState();
    expect(seed.currentUserId).toBe(7);
    expect(seed.bannedUsernames).toEqual([]);
    expect(seed.selectedDistrict).toBe(ALL_LOCATIONS);
    expect(seed.reports.length).toBeGreaterThan(0);
    expect(seed.rewards.length).toBeGreaterThan(0);
    // Identity slice defaults — newly added in v5, extended in v7.
    expect(seed.username).toBeNull();
    expect(seed.identityNullifier).toBeNull();
    expect(seed.loginNullifier).toBeNull();
    expect(seed.isAuthenticated).toBe(false);
    expect(seed.ownershipPublicKey).toBeNull();
    expect(seed.totpSecret).toBeNull();
    expect(seed.adminVerified).toBe(false);
  });

  it("fromVersion < 4 triggers a full reseed (old shape, nothing precious)", () => {
    // Simulate a v1 client with a wildly diverged snapshot — drained
    // users, no rewards, banned everyone, parked on a weird district.
    const stale = {
      currentUserId: 999,
      users: [],
      reports: [],
      rewards: [],
      redeemedVouchers: [],
      bannedUsernames: ["spammer"],
      selectedDistrict: "Centre",
    };
    const migrated = migrateState(stale, 1);
    expect(migrated.users.length).toBeGreaterThan(0);
    expect(migrated.rewards.length).toBeGreaterThan(0);
    expect(migrated.currentUserId).toBe(7);
    expect(migrated.bannedUsernames).toEqual([]);
    // And the Pizza Hut link survives the migrate.
    const reportOne = migrated.reports.find((r) => r.id === 1)!;
    expect(reportOne.rewardId).toBe(5);
  });

  it("leaves an already-current snapshot untouched", () => {
    const current = freshSeedState();
    const migrated = migrateState(current, STORAGE_VERSION);
    expect(migrated).toBe(current);
  });

  it("v4 → v7 MERGES identity defaults onto the existing snapshot (catalogue preserved)", () => {
    // v4 had no identity fields. Existing users' reports / redemptions
    // are still valid post-migration; only the new identity slots get
    // initialised. This is what saves users from losing their state
    // simply because the schema grew.
    const v4Snapshot = {
      currentUserId: 4,
      users: [{ id: 4, username: "eco_defender", email: "x", xp: 999, streak: 2, avatar: "" }],
      reports: [{ id: 1, title: "kept", description: "", difficulty: 1, status: "pending", geometry: { lat: 34.7, lng: 33 }, address: "x", createdById: 4, createdByName: "eco_defender", createdAt: "", photos: [], comments: [], solutions: [] }],
      rewards: [],
      redeemedVouchers: [],
      bannedUsernames: ["someone"],
      selectedDistrict: "Old Port",
    };
    const migrated = migrateState(v4Snapshot, 4);
    // Catalogue / pre-existing data survives.
    expect(migrated.currentUserId).toBe(4);
    expect(migrated.users[0].username).toBe("eco_defender");
    expect(migrated.reports[0].title).toBe("kept");
    expect(migrated.bannedUsernames).toEqual(["someone"]);
    expect(migrated.selectedDistrict).toBe("Old Port");
    // New identity slots come up at their defaults.
    expect(migrated.username).toBeNull();
    expect(migrated.identityNullifier).toBeNull();
    expect(migrated.loginNullifier).toBeNull();
    expect(migrated.isAuthenticated).toBe(false);
    expect(migrated.ownershipPublicKey).toBeNull();
    expect(migrated.totpSecret).toBeNull();
    expect(migrated.adminVerified).toBe(false);
  });

  it("v5 → v7 INVALIDATES the old citizen-ID-derived loginNullifier (forces re-register)", () => {
    // The v5 loginNullifier was PBKDF2(canonicalCitizenId, ...). Under
    // v6 it must be PBKDF2(password, salt+username). Any pre-existing
    // v5 nullifier is the wrong shape and is the source of the
    // username-only fast-path bug; on hydrate we wipe the entire
    // identity slice so the user re-registers with a password.
    const v5Snapshot = {
      currentUserId: 7,
      users: [],
      reports: [],
      rewards: [],
      redeemedVouchers: [],
      bannedUsernames: [],
      selectedDistrict: ALL_LOCATIONS,
      // Stale identity slots from v5 — must not survive.
      username: "alice",
      identityNullifier: "deadbeef".repeat(8),
      loginNullifier: "cafebabe".repeat(8),
      isAuthenticated: true,
      totpSecret: "STALEBASE32",
      adminVerified: true,
    };
    const migrated = migrateState(v5Snapshot, 5);
    // Catalogue stuff preserved as-is.
    expect(migrated.currentUserId).toBe(7);
    expect(migrated.selectedDistrict).toBe(ALL_LOCATIONS);
    // Every identity slot is back to its initial null/false default —
    // there is no path for an old loginNullifier to bypass the
    // password check in the v6 login flow.
    expect(migrated.username).toBeNull();
    expect(migrated.identityNullifier).toBeNull();
    expect(migrated.loginNullifier).toBeNull();
    expect(migrated.isAuthenticated).toBe(false);
    expect(migrated.ownershipPublicKey).toBeNull();
    expect(migrated.totpSecret).toBeNull();
    expect(migrated.adminVerified).toBe(false);
  });

  it("v6 → v7 INVALIDATES a stored loginNullifier with no matching ownership key (forces re-register)", () => {
    // v6 had a password-derived loginNullifier but NO ownership keypair.
    // A v6 user dragging that snapshot into a v7 client would have the
    // nullifier alone — which under v7 is no longer sufficient to
    // authenticate, because the login flow now requires a signature
    // verified against an ownership public key the v6 snapshot never
    // generated. Wipe and force re-register.
    const v6Snapshot = {
      currentUserId: 7,
      users: [],
      reports: [],
      rewards: [],
      redeemedVouchers: [],
      bannedUsernames: [],
      selectedDistrict: ALL_LOCATIONS,
      username: "alice",
      identityNullifier: "deadbeef".repeat(8),
      loginNullifier: "cafebabe".repeat(8),
      isAuthenticated: true,
      role: "citizen",
      // No ownershipPublicKey — v6 didn't have it.
      totpSecret: null,
      adminVerified: false,
    };
    const migrated = migrateState(v6Snapshot, 6);
    expect(migrated.username).toBeNull();
    expect(migrated.loginNullifier).toBeNull();
    expect(migrated.ownershipPublicKey).toBeNull();
    expect(migrated.isAuthenticated).toBe(false);
  });
});
