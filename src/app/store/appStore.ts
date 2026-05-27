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
import {
  createIdentitySlice,
  identityInitialState,
  type IdentitySlice,
} from "./identitySlice";

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
  // Anonymized identity columns surfaced to the admin database view.
  // These two `*Hex` fields are display-only placeholders for the
  // seeded users (who never went through the live register flow);
  // when the actually-registered current user matches a row by
  // username, the registry projection overlays the real PBKDF2
  // nullifier from the identity slice in their place.
  identityNullifierHex: string;
  loginNullifierHex: string;
  role: "admin" | "citizen";
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

export interface AppState extends IdentitySlice {
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

const stateCreator: StateCreator<AppState> = (set, get, store) => ({
  // Identity slice is merged in below; its initial state lives in the
  // slice file so freshSeedState() can mirror it without duplication.
  ...createIdentitySlice(set as Parameters<typeof createIdentitySlice>[0], get, store),

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
export const STORAGE_VERSION = 8;

// Returns the "fresh from seeds" snapshot used both at first hydrate
// and on every hard-reset migration. Exposed for tests so the migrate
// behaviour can be exercised without spelunking through persist
// internals. Includes the identity slice's initial state so a v4 → v5
// migration can layer the new identity fields onto an existing
// catalogue without losing reports/redemptions.
export function freshSeedState(): Pick<
  AppState,
  | "currentUserId"
  | "users"
  | "reports"
  | "rewards"
  | "redeemedVouchers"
  | "bannedUsernames"
  | "selectedDistrict"
  | "username"
  | "identityNullifier"
  | "loginNullifier"
  | "isAuthenticated"
  | "ownershipPublicKey"
  | "totpSecret"
  | "adminVerified"
> {
  return {
    currentUserId: 7,
    users: seedUsers,
    reports: seedReports,
    rewards: seedRewards,
    redeemedVouchers: initialRedeemedVouchers,
    bannedUsernames: [],
    selectedDistrict: ALL_LOCATIONS,
    ...identityInitialState,
  };
}

// Migration policy:
//   - From version <4: shape of seedReports/seedRewards changed
//     enough that the cleanest path is a hard reset to the current
//     seeds (no precious data was tracked at that level).
//   - From version <6: the v4→v5 path added the identity slice;
//     the v5→v6 path invalidated the v5 loginNullifier (which was
//     derived from the citizen ID and was therefore the source of
//     the username-only fast-path bug). Both paths converge on the
//     same destination: layer identityInitialState onto the
//     existing snapshot. Catalogue / reports / redemptions / bans
//     survive untouched; auth slots come up null so the user
//     re-registers with the new password-derived loginNullifier.
//   - From version <7: the ownership proof was added — pre-v7
//     snapshots have no `ownershipPublicKey`, so a stored
//     loginNullifier alone is no longer sufficient to authenticate.
//     Wipe the identity slice so the user re-registers and gets a
//     keypair derived through the new flow. Catalogue survives.
export function migrateState(
  persistedState: unknown,
  fromVersion: number,
): AppState {
  if (fromVersion < 4) {
    return freshSeedState() as unknown as AppState;
  }
  let state: AppState = persistedState as AppState;
  if (fromVersion < 7) {
    state = {
      ...(state as object),
      ...identityInitialState,
    } as unknown as AppState;
  }
  if (fromVersion < 8) {
    // Two-step rewrite. First, scrub the literal "you" residue from
    // pre-v8 persisted state (the id=7 seed user's username was
    // renamed from "you" to "demo_user", and the three reports
    // authored by id=7 had their createdByName updated to match).
    // Second, if the persisted identity slice already carries a
    // registered username (i.e. the user registered under a pre-v8
    // build and we want their credentials to keep working), overlay
    // users[currentUserId] with that identity — the same retroactive
    // sync the refactored register() action performs on a fresh
    // install. The credential triple in the identity slice
    // (username, loginNullifier, ownershipPublicKey) is preserved
    // throughout: this is purely a data-layer realignment.
    const s = state as unknown as {
      users?: UiUser[];
      reports?: UiReport[];
    };
    let nextUsers: UiUser[] =
      s.users?.map((u) =>
        u.username === "you"
          ? { ...u, username: "demo_user", email: "demo_user@limassol.cy" }
          : u,
      ) ?? seedUsers;
    let nextReports: UiReport[] =
      s.reports?.map((r) =>
        r.createdByName === "you" ? { ...r, createdByName: "demo_user" } : r,
      ) ?? seedReports;

    const identity = state as unknown as {
      username?: string | null;
      identityNullifier?: string | null;
      loginNullifier?: string | null;
      role?: "admin" | "citizen" | null;
      currentUserId?: number;
    };
    const session = identity.username;
    if (session && identity.currentUserId != null) {
      const collision = nextUsers.find((u) => u.username === session);
      if (collision) {
        // Registered name matches an existing user — adopt that slot
        // and overlay just the nullifier hex columns. currentUserId
        // moves to the matching id; the previous placeholder row is
        // left alone.
        nextUsers = nextUsers.map((u) =>
          u.id === collision.id
            ? {
                ...u,
                identityNullifierHex:
                  identity.identityNullifier ?? u.identityNullifierHex,
                loginNullifierHex:
                  identity.loginNullifier ?? u.loginNullifierHex,
              }
            : u,
        );
        state = {
          ...state,
          currentUserId: collision.id,
          users: nextUsers,
          reports: nextReports,
        } as AppState;
      } else {
        // No collision — overlay the slot at currentUserId in place.
        const slot = nextUsers.find((u) => u.id === identity.currentUserId);
        if (slot) {
          const prevName = slot.username;
          nextUsers = nextUsers.map((u) =>
            u.id === identity.currentUserId
              ? {
                  ...u,
                  username: session,
                  email: `${session}@limassol.cy`,
                  identityNullifierHex:
                    identity.identityNullifier ?? u.identityNullifierHex,
                  loginNullifierHex:
                    identity.loginNullifier ?? u.loginNullifierHex,
                  role: identity.role ?? u.role,
                }
              : u,
          );
          nextReports = nextReports.map((r) =>
            r.createdByName === prevName
              ? { ...r, createdByName: session }
              : r,
          );
        }
        state = {
          ...state,
          users: nextUsers,
          reports: nextReports,
        } as AppState;
      }
    } else {
      state = {
        ...state,
        users: nextUsers,
        reports: nextReports,
      } as AppState;
    }
  }
  return state;
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
      // Identity slice — derived values only, no PII. Persisting these
      // is what enables "no re-entry of the national ID on the same
      // device". The nullifiers are one-way PBKDF2 outputs.
      username: state.username,
      identityNullifier: state.identityNullifier,
      loginNullifier: state.loginNullifier,
      isAuthenticated: state.isAuthenticated,
      role: state.role,
      // Public half of the Ed25519 ownership keypair. The private half
      // is never persisted — re-derived from typed credentials on each
      // login attempt. JWK-shaped JSON string for stable round-tripping
      // through the persist layer.
      ownershipPublicKey: state.ownershipPublicKey,
      // TOTP secret is persisted in the demo so the admin doesn't have
      // to re-enrol every session. Production would move this to the
      // server.
      totpSecret: state.totpSecret,
      adminVerified: state.adminVerified,
    }),
  }),
);

export { LIMASSOL_CENTER };
