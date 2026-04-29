# Implementation Log — CrowdUpKeep Prototype

A running record of how the thesis MVP was built. Short bullets for
infrastructure decisions; longer, motivated entries for anything that affects
user experience, application logic, or system reliability.

---

## Infrastructure

- Installed Tailwind dependencies and initialized config files.
- Installed Node.js v24 (LTS) via nvm at the user level (no system-wide
  package manager needed).
- Added runtime dependencies: `zustand`, `@prisma/client`, `react`,
  `react-dom`, `@types/leaflet`.
- Added dev tooling: `prisma`, `vitest`, `tsx`, `typescript`, `jsdom`,
  `@types/node`, `@types/react`, `@types/react-dom`,
  `@types/canvas-confetti`.
- Pinned `react-leaflet@^4.2.1` to match React 18 (v5 requires React 19).
- Pinned Prisma to `^6.6.0` — Prisma 5 cannot store `Json` on SQLite, and
  Prisma 7 introduces the `prisma.config.ts` migration that we don't need
  for an MVP. v6 is the only line that gets us SQLite + Json + a stable
  CLI.
- `prisma/schema.prisma` covers `User`, `Report`, `Comment`, `Solution`,
  and `Voucher` per spec.
- `.env` provides `DATABASE_URL="file:./dev.db"` for the dev database.
- `tsconfig.json` and `vitest.config.ts` set up the `@/*` alias to
  match Vite.
- Test pool is `forks` with `singleFork: true` so all integration tests
  share one Prisma client without leaking handles.

---

## Schema design choices

**Why `Json` for `geometry`, `location`, `photos`, and `proofPhotos`** —
the spec uses `String[]` for photo arrays, but SQLite has no native array
type. Prisma's `String[]` is PostgreSQL-only. Prisma 6 added native `Json`
support for SQLite, so we store `{lat, lng}` and arrays as JSON. The API
layer marshals to and from native shapes at the boundary, so consumers
(seed, tests, store, components) never have to JSON.parse anything.

**Why no Prisma relations** — the user spec is intentionally
relation-light (just FK columns). Keeping it that way means joins live
in the application layer (e.g. comment-tree assembly in `api.ts`),
which is both easier to test and trivial to swap to a different
storage engine later.

---

## API layer (`src/lib/api.ts`)

A long, detailed entry: this module is the contract between the data
layer and everything else, so its choices propagate.

- **`xpFor(difficulty) = max(1, round(difficulty)) * 50`** — XP is
  computed from a single source so the seed, the API, and the UI all
  award the same amount. The clamp at 1 prevents zero or negative XP if
  a malformed difficulty (e.g. `0` or `-1`) ever hits the function. Even
  one accepted solution must produce a positive incentive; otherwise the
  whole gamification loop loses its motivational force.
- **`acceptSolution(solutionId, solverId)` is a single
  `prisma.$transaction`.** Three writes have to land together: mark the
  solution `accepted`, mark the report `solved`, and increment the
  solver's XP. If any one of those fails, none should land — otherwise
  we end up with XP awarded for a solution that the UI will keep
  showing as `pending`, and the leaderboard becomes a lie.
- **`claimVoucher` uses `updateMany` with a `where: { claimedBy: null }`
  guard.** Two users tapping "Redeem" on the same low-stock voucher at
  the same instant is an obvious race. The conditional `updateMany` is
  the SQLite equivalent of `UPDATE … WHERE claimed_by IS NULL` — only
  the first claim wins; subsequent ones see `count: 0` and are told the
  voucher is already taken, no double-spend possible.
- **`listReportsInBBox` filters in the application layer.** SQLite
  cannot index or filter inside a JSON column, so we pull all reports
  and run the bbox check in JS. With <10k reports per city this is
  fine; the moment we need PostGIS, the call sites don't change.
- **`listReportsNear` runs bbox first, haversine second.** Bounding
  box is a cheap O(n) numeric check; haversine is O(n) trig. Doing the
  bbox first lets us throw away ~90% of out-of-region candidates
  before any trig runs.
- **`listCommentsForReport` returns a tree, not a flat list.** The UI
  wants a recursive structure, and building it server-side keeps
  components dumb. The algorithm is a single-pass O(n) build using a
  `Map<id, node>` index.

---

## Zustand store (`src/app/store/appStore.ts`)

Long entry: this is the runtime state behind every screen.

The store mirrors the Prisma schema closely (`UiReport.geometry`,
`UiReport.createdById`, etc.) so that a future swap to a real backend is
a search-and-replace, not a rewrite.

- **Why a separate UI store rather than calling Prisma from React** —
  the browser cannot run the Prisma client directly; that's a
  Node-only library. Long term the UI will hit a REST/RPC endpoint;
  short term Zustand gives us the same selector ergonomics
  React would give us against an actual API, plus a reset hook for
  tests.
- **`addReport` prepends rather than appends.** New reports are the
  most relevant to the user that just submitted them; placing them at
  the top eliminates the "scroll to bottom" problem on the dashboard.
- **`acceptSolution` uses the same `xpFor` rule as the API.** If the
  UI and the server ever diverge on the XP formula, users will
  legitimately accuse the platform of cheating them out of points.
  Sharing the helper module is a small structural choice that
  prevents an entire category of trust bug.
- **`redeemReward` is gated three ways: existence, stock, balance.**
  Each gate corresponds to a real user-facing failure mode; folding
  them into one boolean would make the toast/error UX dishonest.
- **`bumpStreak` is exposed but the daily login trigger is left out
  of scope** — streaks rely on a "first action of the day" predicate
  we'd want a server clock for.

---

## UI transformation

- **Leaflet CSS is imported once in `main.tsx`.** Map tiles render
  via Leaflet's CSS sprite layout; without the stylesheet, marker
  shadows offset wrong and tile borders show as 1px grey lines. We
  also explicitly point each marker variant at remote PNGs so the
  default-icon path bug (a known Leaflet/webpack quirk) doesn't
  silently leave us with white squares on production builds.
- **`DashboardMap` is centred on Limassol** (34.7071°N, 33.0226°E).
  All synthetic data is scattered around that point so the map is
  populated on first load — empty maps are a thesis-demo killer.
- **Markers are colour-coded by status** (red/orange/green) so a
  reviewer can read the city at a glance: where are the open issues,
  where are crews working, where has the community already won.
- **`ReportDetail` builds the comment tree from the flat
  `parentId` list using the same algorithm the API uses
  server-side.** This keeps the recursive `<CommentItem>` simple — it
  just renders `replies` recursively — and means a comment created
  by the UI is immediately renderable without a re-fetch.
- **`AdminValidate` no longer uses local `useState` to track
  acceptance.** That was a Figma-prototype tell: tapping "accept"
  flipped a toggle in component state but never persisted, so the
  user-facing report stayed `pending`. The new implementation calls
  the store's `acceptSolution`, which is the same code path the
  citizen-facing accept button uses, ensuring admin and self-service
  flows stay in sync.
- **`Leaderboard` is now derived from live XP**, not a frozen `rank`
  field. Accepted solutions immediately re-order the board, which is
  what users expect from a gamified system.
- **`NewReportModal` actually creates reports.** The Figma version
  toasted "submitted" but never wrote anywhere — the report would
  vanish on next render. The transformed flow writes via the store
  and navigates to `/report/:id` so users see proof of their work.
- **The Figma `currentUser` constant was replaced with
  `getCurrentUser()`.** The constant froze XP at module-load time;
  every screen showed stale numbers after a redemption or accepted
  solution. The selector pulls live state.

---

## Seed (`scripts/seed.ts`)

- 50 users, 100 reports, ~200 comments (some nested), ~30 solutions
  (~half accepted to exercise the XP trigger), 15 vouchers
  (~20% pre-claimed to demonstrate the claim-state UI). All
  geometry is scattered within ~8km of central Limassol.
- The seed wipes existing data first, so re-running it is safe and
  idempotent.

---

## Tests (`src/__tests__/`)

- **`geo.test.ts`** — 8 cases over `bboxFromCenter`, `pointInBBox`,
  and `haversineKm`. Includes a real-world distance check
  (Limassol→Nicosia ≈ 62km) so a regression that swapped degrees
  and radians would fail loudly, and a southern-hemisphere case so
  we catch sign-bug regressions.
- **`api.test.ts`** — 17 integration cases against a fresh SQLite
  file per run. Covers user/report/comment/solution/voucher CRUD,
  bbox + radius geo queries, the comment-tree builder, the XP
  trigger (single-accept and double-accept), idempotent voucher
  claims, and unique-email enforcement.
- **`store.test.ts`** — 7 cases over the Zustand store: report
  creation, recursive comments, the XP trigger end-to-end (matching
  the API's award), reward redemption with all three failure
  modes, and ban idempotency.
- Coverage thresholds in `vitest.config.ts` are 80%
  lines/functions/statements over `src/lib` and the store, with
  branches at 70% (matching the brief's headline goal).
