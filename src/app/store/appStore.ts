import { create, type StateCreator } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { xpFor } from "@/lib/xp";
import type { LatLng } from "@/lib/geo";
import {
  ALL_LOCATIONS,
  DISTRICT_CENTERS,
  type District,
  type LocationFilter,
} from "@/lib/districts";
import { LIMASSOL_CENTER, seedReports, seedRewards, seedUsers } from "../data/mockData";

// In-browser state mirrors the Prisma schema closely so swapping the runtime
// to a real API later is a search-and-replace, not a rewrite.

export interface ReportComment {
  id: number;
  authorId: number;
  authorName: string;
  text: string;
  timestamp: string;
  parentId: number | null;
}

export interface ReportSolution {
  id: number;
  reportId: number;
  description: string;
  proofPhotos: string[];
  submittedById: number;
  submittedByName: string;
  submittedAt: string;
  status: "pending" | "accepted" | "rejected";
}

export interface UiReport {
  id: number;
  title: string;
  description: string;
  difficulty: number;
  status: "pending" | "in-progress" | "solved";
  geometry: LatLng;
  address: string;
  createdById: number;
  createdByName: string;
  createdAt: string;
  photos: string[];
  comments: ReportComment[];
  solutions: ReportSolution[];
  // Optional link to a specific reward in the catalogue. When set, the
  // proximity popup's "available" check uses that reward's stock alone
  // instead of the global inventory total — so a report tied to a 0-stock
  // voucher deterministically renders the "XP challenge" copy regardless
  // of how much stock the rest of the catalogue holds.
  rewardId?: number;
}

export interface UiUser {
  id: number;
  username: string;
  email: string;
  xp: number;
  streak: number;
  avatar: string;
  location?: LatLng;
}

export interface UiReward {
  id: number;
  title: string;
  description: string;
  xpCost: number;
  stock: number;
  imageUrl: string;
}

export interface RedeemedVoucher {
  id: number;
  rewardId: number;
  code: string;
  title: string;
  redeemedAt: string;
}

export interface AppState {
  currentUserId: number;
  users: UiUser[];
  reports: UiReport[];
  rewards: UiReward[];
  redeemedVouchers: RedeemedVoucher[];
  bannedUsernames: string[];

  // global UI filter — the "Current Area" dropdown. Persisted so a
  // returning user keeps their last context.
  selectedDistrict: LocationFilter;
  setSelectedDistrict: (filter: LocationFilter) => void;

  // user
  getCurrentUser: () => UiUser;
  bumpStreak: () => void;

  // reports
  addReport: (input: {
    title: string;
    description: string;
    difficulty: number;
    // Either supply explicit geometry/address (admin/test path) or a
    // district — citizens filing from the dashboard go via district so the
    // pin lands in the area they're already filtering by.
    geometry?: LatLng;
    address?: string;
    district?: District;
    photo?: string | null;
  }) => UiReport;
  setReportStatus: (reportId: number, status: UiReport["status"]) => void;

  // comments
  addComment: (input: {
    reportId: number;
    text: string;
    parentId?: number | null;
  }) => void;

  // solutions
  addSolution: (input: { reportId: number; description: string; proofPhoto?: string | null }) => void;
  acceptSolution: (reportId: number, solutionId: number) => { xpAwarded: number; solverName: string } | null;

  // rewards
  redeemReward: (rewardId: number) => RedeemedVoucher | null;

  // admin
  banUser: (username: string) => void;

  // Returns the credits + availability metadata the Nearby popup renders
  // for a given report. xpCost is the XP earned by solving the report
  // (xpFor(difficulty)). `available` is true when the report is still
  // solvable AND there is some redeemable reward inventory left — the
  // combination the proximity prompt is trying to pitch.
  getRewardStatusForReport: (
    reportId: number | string,
  ) => {
    xpCost: number;
    available: boolean;
    stock: number;
  } | null;
}

const PLACEHOLDER_PHOTO =
  "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800";
const PLACEHOLDER_PROOF =
  "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=800";

let nextId = 100_000;
const newId = () => ++nextId;

const initialRedeemedVouchers: RedeemedVoucher[] = [
  {
    id: 9001,
    rewardId: 3,
    title: "Coffee Shop €25",
    code: "CUK-CF25-9821",
    redeemedAt: "2026-04-10T09:00:00Z",
  },
  {
    id: 9002,
    rewardId: 4,
    title: "Cinema Tickets (2x)",
    code: "CUK-CN2X-4563",
    redeemedAt: "2026-04-05T19:00:00Z",
  },
];

const stateCreator: StateCreator<AppState> = (set, get) => ({
  currentUserId: 7,
  users: seedUsers,
  reports: seedReports,
  rewards: seedRewards,
  redeemedVouchers: initialRedeemedVouchers,
  bannedUsernames: [],
  selectedDistrict: ALL_LOCATIONS,

  setSelectedDistrict: (filter) => set({ selectedDistrict: filter }),

  getCurrentUser: () => {
    const { users, currentUserId } = get();
    return users.find((u) => u.id === currentUserId) ?? users[0];
  },

  bumpStreak: () =>
    set((s) => ({
      users: s.users.map((u) =>
        u.id === s.currentUserId ? { ...u, streak: u.streak + 1 } : u,
      ),
    })),

  addReport: ({ title, description, difficulty, geometry, address, district, photo }) => {
    const me = get().getCurrentUser();

    // Resolve geometry + address. Order of preference:
    //   1. Explicit geometry/address (callers that already know the spot).
    //   2. district -> DISTRICT_CENTERS lookup (citizen flow with a chosen
    //      area). The address built here matches the regex matchers in
    //      lib/districts.ts so the new pin participates in district
    //      filtering immediately.
    //   3. Fallback to LIMASSOL_CENTER for "no context" reports.
    const districtAnchor = district ? DISTRICT_CENTERS[district] : null;
    const finalGeometry: LatLng = geometry ?? districtAnchor?.geometry ?? LIMASSOL_CENTER;
    const finalAddress: string =
      address ??
      districtAnchor?.address ??
      `Limassol (${finalGeometry.lat.toFixed(4)}, ${finalGeometry.lng.toFixed(4)})`;

    const report: UiReport = {
      id: newId(),
      title,
      description,
      difficulty,
      status: "pending",
      geometry: finalGeometry,
      address: finalAddress,
      createdById: me.id,
      createdByName: me.username,
      createdAt: new Date().toISOString(),
      photos: [photo || PLACEHOLDER_PHOTO],
      comments: [],
      solutions: [],
    };
    set((s) => ({ reports: [report, ...s.reports] }));
    return report;
  },

  setReportStatus: (reportId, status) =>
    set((s) => ({
      reports: s.reports.map((r) => (r.id === reportId ? { ...r, status } : r)),
    })),

  addComment: ({ reportId, text, parentId }) => {
    const me = get().getCurrentUser();
    set((s) => ({
      reports: s.reports.map((r) =>
        r.id !== reportId
          ? r
          : {
              ...r,
              comments: [
                ...r.comments,
                {
                  id: newId(),
                  authorId: me.id,
                  authorName: me.username,
                  text,
                  timestamp: new Date().toISOString(),
                  parentId: parentId ?? null,
                },
              ],
            },
      ),
    }));
  },

  addSolution: ({ reportId, description, proofPhoto }) => {
    const me = get().getCurrentUser();
    set((s) => ({
      reports: s.reports.map((r) =>
        r.id !== reportId
          ? r
          : {
              ...r,
              status: r.status === "solved" ? r.status : "in-progress",
              solutions: [
                ...r.solutions,
                {
                  id: newId(),
                  reportId,
                  description,
                  proofPhotos: [proofPhoto || PLACEHOLDER_PROOF],
                  submittedById: me.id,
                  submittedByName: me.username,
                  submittedAt: new Date().toISOString(),
                  status: "pending",
                },
              ],
            },
      ),
    }));
  },

  acceptSolution: (reportId, solutionId) => {
    const state = get();
    const report = state.reports.find((r) => r.id === reportId);
    const solution = report?.solutions.find((s) => s.id === solutionId);
    if (!report || !solution) return null;
    const xpAwarded = xpFor(report.difficulty);
    set((s) => ({
      reports: s.reports.map((r) =>
        r.id !== reportId
          ? r
          : {
              ...r,
              status: "solved",
              solutions: r.solutions.map((sol) =>
                sol.id === solutionId ? { ...sol, status: "accepted" } : sol,
              ),
            },
      ),
      users: s.users.map((u) =>
        u.id === solution.submittedById ? { ...u, xp: u.xp + xpAwarded } : u,
      ),
    }));
    return { xpAwarded, solverName: solution.submittedByName };
  },

  redeemReward: (rewardId) => {
    const state = get();
    const reward = state.rewards.find((r) => r.id === rewardId);
    const me = state.getCurrentUser();
    if (!reward || reward.stock <= 0 || me.xp < reward.xpCost) return null;
    const code = `CUK-${rewardId}${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}-${Math.floor(Math.random() * 10_000)}`;
    const voucher: RedeemedVoucher = {
      id: newId(),
      rewardId,
      title: reward.title,
      code,
      redeemedAt: new Date().toISOString(),
    };
    set((s) => ({
      users: s.users.map((u) =>
        u.id === s.currentUserId ? { ...u, xp: u.xp - reward.xpCost } : u,
      ),
      rewards: s.rewards.map((r) =>
        r.id === rewardId ? { ...r, stock: r.stock - 1 } : r,
      ),
      redeemedVouchers: [voucher, ...s.redeemedVouchers],
    }));
    return voucher;
  },

  banUser: (username) =>
    set((s) => ({
      bannedUsernames: s.bannedUsernames.includes(username)
        ? s.bannedUsernames
        : [...s.bannedUsernames, username],
    })),

  getRewardStatusForReport: (reportId) => {
    const id = typeof reportId === "string" ? Number(reportId) : reportId;
    const report = get().reports.find((r) => r.id === id);
    if (!report) return null;
    // Stock the popup pitches against. Two-tier rule:
    //   1. If the report has an explicit `rewardId`, use that single
    //      reward's stock — a report tied to the 0-stock Pizza Hut
    //      voucher should render "XP challenge" even when the rest of
    //      the catalogue is fully stocked.
    //   2. Otherwise fall back to total redeemable inventory across
    //      all rewards — the old global-catalogue rule.
    // A linked rewardId that no longer matches any reward (stale data)
    // falls through to the global total so the popup degrades to the
    // unlinked behaviour instead of crashing.
    const linkedReward =
      report.rewardId != null
        ? get().rewards.find((r) => r.id === report.rewardId)
        : null;
    const stock = linkedReward
      ? linkedReward.stock
      : get().rewards.reduce((acc, r) => acc + r.stock, 0);
    return {
      xpCost: xpFor(report.difficulty),
      available: report.status !== "solved" && stock > 0,
      stock,
    };
  },
});

// Storage adapter that's a no-op outside the browser. Lets the persist
// middleware run unconditionally without crashing or warning during Node-side
// Vitest runs (which don't have window/localStorage).
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const safeStorage = (): StateStorage =>
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : noopStorage;

export const STORAGE_KEY = "crowdupkeep-state-v1";
export const STORAGE_VERSION = 4;

// Returns the "fresh from seeds" snapshot used both at first hydrate and
// on every hard-reset migration. Exposed for tests so the migrate
// behaviour can be exercised without spelunking through persist
// internals.
export function freshSeedState(): Pick<
  AppState,
  | "currentUserId"
  | "users"
  | "reports"
  | "rewards"
  | "redeemedVouchers"
  | "bannedUsernames"
  | "selectedDistrict"
> {
  return {
    currentUserId: 7,
    users: seedUsers,
    reports: seedReports,
    rewards: seedRewards,
    redeemedVouchers: initialRedeemedVouchers,
    bannedUsernames: [],
    selectedDistrict: ALL_LOCATIONS,
  };
}

// Hard reset for any client below the current STORAGE_VERSION: drop
// persisted reports, redeemed vouchers, bans, etc. and rehydrate
// everything from the mockData seeds. Bumped each time seedReports /
// seedRewards changes shape in a way that breaks older snapshots —
// e.g. v4 added the `rewardId` field on reports and a renamed
// 0-stock voucher.
export function migrateState(
  persistedState: unknown,
  fromVersion: number,
): AppState {
  if (fromVersion < STORAGE_VERSION) {
    return freshSeedState() as unknown as AppState;
  }
  return persistedState as AppState;
}

export const useAppStore = create<AppState>()(
  persist(stateCreator, {
    name: STORAGE_KEY,
    version: STORAGE_VERSION,
    storage: createJSONStorage(safeStorage),
    migrate: migrateState,
    // Only persist data, not the function selectors. Functions are
    // re-attached on every store creation by the state creator.
    partialize: (state) => ({
      currentUserId: state.currentUserId,
      users: state.users,
      reports: state.reports,
      rewards: state.rewards,
      redeemedVouchers: state.redeemedVouchers,
      bannedUsernames: state.bannedUsernames,
      selectedDistrict: state.selectedDistrict,
    }),
  }),
);

export { LIMASSOL_CENTER };
