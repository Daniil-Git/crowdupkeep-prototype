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

---

## Stability fixes (round 2)

### 1. Persistence on refresh

The store now uses Zustand's `persist` middleware, keyed under
`crowdupkeep-state-v1` in `localStorage`, with a `partialize` that
keeps state out of the persisted blob (only data, not selectors).
A `noopStorage` fallback runs when `window.localStorage` is
unavailable so that Vitest in Node can still construct the store
without warnings.

`App.tsx` now blocks the route tree until
`useAppStore.persist.hasHydrated()` resolves. Without that gate,
screens like Profile/Dashboard would mount with the seed data and
then snap to the persisted values mid-render — a perceptible
flicker on every refresh, and on the leaderboard it briefly
displayed the wrong rank.

The version field in the persist config (`version: 1`) is the
hook for breaking changes: when the schema evolves we bump the
version and supply a migration, rather than letting stale state
crash a future build.

### 2. NotificationOverlay routing + duplicate close icon

The Figma version had its own absolutely-positioned `<button>` with
a lucide `X` rendered against the gradient background — but
`DialogContent` already injects a `DialogPrimitive.Close` at top-4
right-4 (see `src/app/components/ui/dialog.tsx:66`). The result
was two close icons stacked at the same coordinates; the manual
one was the brighter, the radix one slightly faded. Removing the
manual button leaves the radix close button as the single
affordance, with a class override on `DialogContent` to recolor
it for the gradient background.

Routing was the deeper bug: "View Issue" used to call
`onOpenChange(false)` and nothing else. The user got a hopeful
toast and dropped back on the dashboard with no path to the
issue. The new implementation picks the closest pending report
to the user's last known location via `pickNearbyReport`
(haversine over the pending set) and navigates to
`/report/:id`. If the user has no recorded location, it falls
back to the first pending report rather than no-op'ing. The
button is `disabled` when there is genuinely nothing pending,
which is more honest than navigating to a placeholder.

### 3. Map and image layout

**Dashboard scrollbar.** The previous flex-1 + `max-h-[180px]
overflow-y-auto` gave us two scrollbars stacked inside the iPhone
frame: the page itself and a tiny secondary scroller for "My
Reports". Users on touch devices couldn't reliably scroll either
one. The map now has a fixed `h-[55vh]`; the My Reports list
flows below it without internal overflow; the page itself
scrolls naturally. This matches the rest of the app (Profile,
Rewards, Leaderboard) which already used the natural-scroll
pattern.

**ReportDetail map z-index containment.** Leaflet sets z-indexes
on its internal panes — tiles ~200, overlays ~400, markers ~600,
popups ~700, controls ~800 — relative to the document. On the
report detail page, those numbers were leaking through the photo
above the map and (once the report scrolled) the description
below. The fix wraps the map in a `relative isolate z-0
overflow-hidden` container, which (a) creates a fresh stacking
context so Leaflet's z-indexes only fight among themselves, and
(b) clips any overflowing panes (e.g. controls that anchor
outside the map bounds). The `MapContainer` itself also gets
`zIndex: 0` so its own outer layer participates in the new
context.

**Map popup navigation.** Previously the marker had a `click`
handler that navigated, *and* opened a popup at the same time —
on desktop the popup blinked open and immediately the route
changed; on touch the same gesture fought the popup tap. The new
behaviour: clicking a marker opens the popup; the popup body is
itself a `<button>` that navigates on tap, with an explicit
"Tap to view details →" affordance so the interaction is
discoverable.

### 4. Image rendering on `/report/7`

The seed photo URL for report 7
(`photo-1519642984756-ebf03acb7729`) returns HTTP 404 from
Unsplash. That was confirmed via `curl -I` against the same URL
the browser would request. Two fixes landed together:

- **Replaced the dead URL** with `photo-1503455637927-730bce8583c0`
  (a verified-200 park scene that fits the bench-in-park theme).
- **Wrapped the photo carousel in `ImageWithFallback`** so the
  next dead URL — and there will be one — degrades to the
  shadcn-style placeholder rather than a broken-image icon.

A `safeIndex` clamp on the carousel index also prevents an
out-of-range render if a report's photo list shrinks (e.g.
because a solution was edited) while the carousel is open.

### 5. Tests reflecting the changes

- The store reset helper now also calls
  `useAppStore.persist.clearStorage()` so persisted state from a
  previous test can never leak into the next one. (In practice
  the `noopStorage` fallback makes this a no-op in CI, but it's
  the right shape if a test ever runs against a real
  `localStorage`.)
- New `useAppStore` test asserting the persist namespace
  (`hasHydrated`, `onFinishHydration`, `clearStorage`) is
  attached — it's a guardrail against accidental regressions
  where someone removes the middleware in a future refactor and
  the App.tsx hydration gate silently breaks.
- New `pickNearbyReport` tests covering the three real branches:
  "with origin → closest", "without origin → first pending", and
  "empty → null".

Test count went from 32 to 36, all green.

---

## Feature polish (round 3)

### 1. Global "Current Area" location dropdown

**Why a dropdown lives in the store, not in props.** Several screens
(Dashboard map, Dashboard "My Reports" list, Notification overlay,
Profile) need to react to the same filter. Threading a prop through
every navigation step is fragile; a single store key keeps the
selection and any reactor automatically synchronised. The new field
is `selectedDistrict: LocationFilter`, defaulting to `"All Locations"`,
plus a `setSelectedDistrict` action.

**Why a derived district instead of a Prisma column.** The brief
asked us not to touch unrelated API logic. Adding a `district` column
would have meant a schema migration, a re-seed, and a new test for
data-layer round-tripping. Instead `src/lib/districts.ts` derives
the district from the existing `address` string with a small list of
case-insensitive regexes. Adding new neighbourhoods is one regex
entry, not a migration.

**Where the dropdown lives.** `LocationDropdown` is a single
component with a `header` and `panel` variant:
- Dashboard renders the header variant in the blue top bar so a
  citizen on the map can switch context without scrolling away.
- Profile renders the panel variant inside the body, framed with a
  short caption so the user understands the dropdown's reach.

**What it filters.** `DashboardMap` and Dashboard's "My Reports"
list use `matchesFilter(address, selectedDistrict)`. The
`NotificationOverlay`'s `pickNearbyReport` now also takes the
filter — if a user has hidden Dasoudi, the proximity prompt
should not surface a Dasoudi issue and break the mental model.

**Persistence.** `selectedDistrict` was added to the persist
`partialize` set. A returning user lands on the same district
they last picked, on every device that can read their
localStorage.

### 2. Verification modal UX

Both the Login "Verify ID/DOB" modal and the Profile "Re-upload
ID" modal were uncontrolled `<Dialog>` components: they relied on
`<DialogTrigger>` for the open transition, but the success
handlers tried to close them via local `useState` calls that
Radix simply ignored. The visible bug was that the modal sat
open over the success toast.

The fix:
- Both dialogs are now controlled (`open` / `onOpenChange`).
- The trigger is a plain `Button` whose `onClick` flips the
  state, so we no longer rely on Radix's built-in
  trigger semantics and we can rule out timing glitches.
- The submit handler runs a small awaited delay (≈600ms) to
  simulate verification, then in order: clears verifying state,
  closes the modal, clears the staged file, fires the toast.
- During verification, both `disabled` on the button and an
  early-return in `onOpenChange` stop the user from dismissing
  the modal mid-submit, which was a small UX hole that would
  otherwise let them double-submit.
- The submit button label switches to "Verifying…" while the
  await is in flight, so the brief delay doesn't read as a
  no-op tap.

### 3. Tests reflecting the changes

- New `districts.test.ts` (6 cases) covering the address →
  district mapping, the `LOCATION_OPTIONS` ordering invariant
  (All Locations first), the case-insensitive matching, and
  the `Other` fallback for unmatched addresses.
- New store cases for `selectedDistrict`: default value,
  `setSelectedDistrict` synchronous update, and a partialize
  introspection check that catches the regression where
  someone removes the field from the persist payload.
- New `pickNearbyReport` cases: respects an active district
  filter, and returns `null` when the filter eliminates the
  candidate set entirely.

Test count now 47 (was 36), all green.

## Nearby Issue Popup: sync Credits + Title + Availability

The `NotificationOverlay` nearby‑issue popup was previously showing **hardcoded** `+100 XP` and a static title/fallback, without wiring into live reward/XP logic. This entry refactors the popup so Credits, Title, and Availability are derived from the same store data as the rest of the UI, making them consistent and “in sync” with the current dev branch.

- **`pickNearbyReport` moved to `src/lib/nearby.ts`**  
  The helper that picks the closest pending report is now a pure, store‑agnostic function, re‑used directly by both `NotificationOverlay` and the store tests. The `store.test.ts` cases are retitled to `pickNearbyReport (lib/nearby)` to reflect the new location and keep coverage aligned with the refactored logic.

- **NotificationOverlay now derives everything from store state**  
  The popup now:
  - Uses `getRewardStatusForReport(reportId)` (added to `AppState`) to determine whether a reward is still available and how much XP it costs.
  - Computes `rewardLabel` via `getProximityRewardLabel(xp, rewardStatus)` so the XP hint is always consistent with `xpFor(difficulty)`.
  - Dynamically shows:
    - Title as `nearbyReport.title` (or a generic label when none is available).
    - Distance as `~X.Xkm away` using `haversineKm(me.location, nearbyReport.geometry)`.
    - Availability status: when `!rewardStatus.available`, the popup additionally shows a small `No reward available` tag with a `Package` icon.

- **XP and reward logic unified in the store**  
  A new `getRewardStatusForReport` selector was added to `appStore.ts` that:
  - Maps `report.id` to a reward (if any) via `rewards.find(r => r.id === reportId)`.
  - Exposes `{ xpCost, available, stock }` so the UI can reflect real‑time availability without duplicating voucher‑logic.

- **UI text and behavior tightened**  
  The popup’s copy was updated to clearly distinguish:
  - generic civic‑engagement encouragement when no issue is nearby, and
  - concrete XP plus reward text when a qualified issue is visible.
  The `View Issue` button is now disabled when:
  - there is no `nearbyReport`, or
  - the tied‑to‑it reward is no longer available (`disabled={disabled}`).

These changes ensure the Nearby Issue Popup no longer relies on hardcoded strings for Credits, Title, or Availability, but instead queries the same store slice and helpers (`nearby.ts`, `geo.ts`, `districts.ts`, `xp.ts`) that underpin the rest of the MVP, so behavior stays consistent across the dev branch.


- Minor demo‑only adjustments:
  - Renewed the IKEA‑style voucher image URL to keep the Unsplash pattern aligned.
  - Tweaked sample XP values on selected fake‑user reports so the popup’s XP hints are more representative in the thesis demo.

---

## Stability fixes (round 4)

### 1. The "fall back to defaults" Nearby popup

The picker that feeds the Nearby Issue overlay was filtering on
`r.status === "open"`. There is no `"open"` status anywhere in the
codebase — the canonical enum is `"pending" | "in-progress" | "solved"`.
That single literal was emptying the candidate set on every render,
so `pickNearbyReport` returned `null` and `NotificationOverlay`
fell through to its generic copy ("🚨 Nearby civic issue", "Help
your neighbours…") for every district. The three picker tests in
`store.test.ts` had been failing since the regression landed.

The fix in `lib/nearby.ts`:
- Filter on `"pending"` to match the actual report enum.
- Restore proper typing (`NearbyCandidate` generic) instead of the
  `any[]` escape hatch — that's what let the wrong literal slip in
  unnoticed.
- Keep the picker pure; no store binding so unit tests can hit it
  with synthetic fixtures.

While there, `NotificationOverlay` had three secondary bugs that
would have surfaced as runtime errors the moment the picker
returned anything non-null:
- It pulled `xpFor` from `useAppStore.getState()` — `xpFor` lives
  in `@/lib/xp`, not on the store, so the call would have thrown
  *xpFor is not a function*.
- It checked `bannedUsernames.includes(r.createdBy?.email)`. The
  `UiReport` shape has `createdById` and `createdByName`, no
  nested `createdBy` object, so the check silently always passed.
  Now the overlay filters by `createdByName`.
- `useState(null)` for `nearbyReport`/`rewardStatus` lost type
  information (TS inferred `null`), making subsequent assignments
  type errors. Replaced with a single `useMemo` over the store
  selectors, which is also less work per render.

`getRewardStatusForReport` was looking up `rewards.find(r => r.id === Number(reportId))` — wrong collection. The function name says
"for a report" but it was indexing the rewards table with a report
id. Re-implemented to:
- Look up the actual report.
- Compute `xpCost` from the shared `xpFor(difficulty)` helper, so
  the popup, the leaderboard, and the API can never disagree.
- Treat `available` as "report is still solvable AND there is some
  redeemable reward inventory left" — the combination the popup is
  pitching ("earn XP + reward").
- Accept either a `number` or a `string` id so call sites that get
  values from `useParams()` don't need their own coercion.

The label-rendering branch (`+XP challenge` / `+XP + reward`) was
extracted into `proximityRewardLabel(xp, rewardStatus)` and
re-exported from the overlay so it can be unit-tested without a
render tree.

### 2. Single source of truth for districts

Before this round, the citizen `LocationDropdown` and the admin
dashboard each had their own location filter:
- Citizen: `selectedDistrict` in the Zustand store, six districts
  derived from the seed addresses, persisted across refresh.
- Admin: a local `useState<string>("all")` with three hardcoded
  options ("Limassol", "Old Port", "Molos") and a substring
  `address.includes(...)` test.

Toggling on one side did nothing on the other, the option lists
disagreed, and the `"Limassol"` substring test matched every
report regardless of neighbourhood (every seed address contains
"Limassol"), so the admin filter was effectively a no-op.

`AdminDashboard.tsx` now:
- Drops the local `locationFilter` state.
- Renders the same `<LocationDropdown />` component the citizen
  views render.
- Filters with `matchesFilter(address, selectedDistrict)` from
  `lib/districts.ts` — same matchers the citizen surfaces use.
- Computes its headline stats (`total / pending / inProgress /
  solved`) from the *filtered* set, so picking "Old Port" updates
  the numbers in the purple stat band, not just the table below.

### 3. Auto-linking new reports to a district

`NewReportModal` was hard-coding `geometry: LIMASSOL_CENTER`, and
the store's `addReport` was synthesising an address of
`"Limassol (lat, lng)"`. None of the district matchers recognise
that shape, so every new report fell into the `"Other"` bucket.
A citizen filtering by "Centre" wouldn't see the report they had
just filed *from* the Centre filter.

Two changes:
- `lib/districts.ts` exports `DISTRICT_CENTERS` — a representative
  `{ geometry, address }` per district, taken from the seed
  anchors so new pins land where reviewers expect them. Round-trip
  is enforced in `districts.test.ts`:
  `addressToDistrict(DISTRICT_CENTERS[d].address) === d`.
- `addReport` accepts an optional `district`. When supplied it
  resolves geometry + address from `DISTRICT_CENTERS`. Explicit
  `geometry` / `address` still win (admin/test path), and the
  bare-call fallback to `LIMASSOL_CENTER` still works.

`NewReportModal` now reads the global `selectedDistrict`, defaults
the modal's draft to it (or `"Centre"` when the user is on
`"All Locations"`), exposes a District `<Select>` so the user can
override before submit, and shows the resolved anchor address +
coords as a confirmation strip. After submit, if the user was
filtering on a specific district that differs from the chosen
draft, we snap the global filter to the new district so the
just-filed pin appears without a manual re-select.

### 4. Search + dynamic stats consistency

The admin dashboard now also has a free-text search input that
runs over `title / description / address / createdByName`. It
flows through the same `useMemo` pipeline as the district +
status filters, so the headline stats reflect the search term
too. There's no equivalent search on the citizen dashboard yet
(the citizen only sees their own reports there), but the
`filteredReports` shape and reducer pattern are the same on both
sides, ready to be lifted if needed.

### 5. Tests reflecting the changes

- `store.test.ts` picker tests: now passing on the `"pending"`
  status. The 3 failures that motivated this round are green.
- `districts.test.ts`: 2 new cases — every `DISTRICT_CENTERS`
  address round-trips through the matcher, and every anchor
  geometry sits inside a Limassol-region bounding box.
- `store.test.ts`:
  - `addReport({ district: "Old Port" })` produces an address
    the matcher recognises and geometry inside the Old Port
    anchor zone.
  - `getRewardStatusForReport`: 5 cases — pending report with
    stock is `available`, solved report is not, no-stock makes
    even pending reports unavailable, unknown id returns null,
    string-id coercion works.
  - `proximityRewardLabel`: 4 cases — `null` status, unavailable
    status, matching xp, and divergent xp (store wins).

Test count went from 47 to 59, all green.

---

## Stability fixes (round 5) — empty-state popup suppression

The Nearby popup must not lie. If, for the active district, there is
nothing pending to surface, the overlay should not appear at all —
not even with default copy. Defense in depth across two layers:

### 1. The shared gating predicate

Added `hasNearbyReport(reports, origin, districtFilter)` next to the
existing `pickNearbyReport` in `lib/nearby.ts`. It is the boolean
dual of the picker — true iff `pickNearbyReport(...) !== null`. The
trigger and the render gate now both route through this predicate,
so the answer to "should we open?" can never disagree with "what
would we render?". They share the exact same candidate set.

### 2. Trigger gate (Dashboard)

The 3-second timer in `Dashboard.tsx` previously called
`setShowNotification(true)` unconditionally. It now reads the
latest store state at trigger time and only opens the popup when
`hasNearbyReport(visibleReports, me.location, selectedDistrict)`
is true. Reading state in the timer callback (rather than closing
over the values from mount) is intentional: a citizen who switches
districts during the 3-second window should be evaluated against
the new filter, not the one they landed with.

### 3. Render gate (NotificationOverlay)

When `picked` is `null`, the overlay returns `null` — no Dialog,
no default copy, no focus trap. A `useEffect` also calls
`onOpenChange(false)` so the parent's `open` state stays in sync
(important for the case where the popup was already showing for
"Old Port" and the citizen flips the dropdown to a district with
no pending issues — the overlay self-dismisses).

Now that the empty branch is unreachable inside the rendered
markup, the conditional copy was dropped. The header is always the
report's title and the body always pitches the concrete XP-plus-
reward. This shrinks the component and removes a class of "what if
nearby is null but we're past the early return" follow-on bugs.

### 4. Tests

Four new cases in `store.test.ts` covering both branches of
`hasNearbyReport`:

- All reports flipped to `solved` → predicate is `false` for every
  district (the canonical "popup must stay closed" scenario).
- Empty report list → `false`, with and without an origin.
- Seed data + active district that contains a pending report →
  `true`.
- Drop the only pending Old Port report → predicate flips to
  `false` for "Old Port" while still `true` for `"All Locations"`,
  proving the gate is district-sensitive.

Test count went from 59 to 63, all green.

---

## Dev console + persist v3 hard reset

Two related threads: the rewards catalogue grew and shifted (IKEA
cost bumped, IKEA / Cyta swapped, Cinema Ticket added) — but those
edits were invisible at runtime because Zustand's `persist`
middleware kept rehydrating a v2 snapshot from `localStorage` that
still held the previous seed. And the broader friction motivating
this round was that there is no in-UI way to twiddle state during
thesis demos, so every "what if XP were 2000" question meant a
code edit and a restart.

### 1. Persist version 3: full re-seed on migrate

`useAppStore`'s persist config bumps to `version: 3`. The migrate
now replaces every persisted slice (`currentUserId`, `users`,
`reports`, `rewards`, `redeemedVouchers`, `bannedUsernames`,
`selectedDistrict`) with the values from the mockData seeds plus
the in-file `initialRedeemedVouchers`. The previous v1 → v2
migrate only re-seeded `users` and `rewards`, which was enough to
push the renewed IKEA image, but not enough to clean up downstream
state that had diverged on existing clients (custom reports, prior
redemptions, drained XP). v3 takes the simpler "throw it all away"
stance — fine for a thesis prototype where nothing in persisted
state is precious.

`AppState` was promoted from a local interface to an `export` so
the dev console helpers can type their `setState` calls against it.
The `STORAGE_KEY` itself (`"crowdupkeep-state-v1"`) is unchanged —
only the version metadata inside the persisted blob moves.

### 2. Rewards catalogue updates (`mockData.ts`)

- IKEA €100 Voucher `xpCost`: 1000 → 1500 (premium tier).
- Cyta Internet Discount and IKEA swapped positions in the array,
  so Cyta now lives at `id: 1` and IKEA at `id: 2`. The id swap is
  load-bearing — anywhere else in the codebase that referenced
  reward id 1 would now point at Cyta. A grep confirmed the only
  hardcoded reward ids are 3 and 4 in `initialRedeemedVouchers`
  (Coffee Shop + Cinema Tickets), neither of which moved.
- Added a `Cinema Ticket` reward at `id: 5` with `stock: 0`.
  Intentional zero stock — it surfaces the "out of stock" branch
  in the rewards UI without having to redeem the other entries
  down to zero by hand.

### 3. `window.cu` dev console (`src/app/store/devConsole.ts`)

A small surface attached to `window.cu` so the prototype is
tweakable from DevTools without code edits between demo takes.
The API exposes both the general escape hatch and a few
convenience patchers for the slices we actually want to twiddle
on the fly:

- `cu.state()` — snapshot of the live store.
- `cu.setState(updater)` — same shape as Zustand's `setState`,
  accepts an object or a setter function.
- `cu.patchUser(patch, userId?)` — defaults to the current user.
- `cu.patchReward(id, patch)` and `cu.patchReport(id, patch)`.
- `cu.reset()` — removes `crowdupkeep-state-v1` from
  `localStorage` and reloads. Same effect as the v3 migration but
  on demand.
- `cu.store` — the raw Zustand store for power use (`subscribe`,
  `getState`, etc.).

The module is loaded for its side effect from `main.tsx`. On
boot it prints a one-line `[cu] dev console ready…` hint to the
console so the helpers are discoverable. No production code path
imports from `devConsole.ts`; the only runtime contact is the
`window.cu = api` assignment.

---

## XP challenge: View Issue stays enabled + per-report reward link + Prisma test skip

A bug, a feature, and a chore in one round. The bug: the Nearby
popup's "View Issue" button was disabled whenever the catalogue
had no redeemable inventory (`rewardStatus.available === false`),
which trapped the user inside an "XP challenge" popup they could
neither dismiss meaningfully nor navigate from. The feature: a
way to deterministically reach that XP-challenge branch for
thesis demos — independent of the global catalogue's stock
levels. The chore: get rid of the noisy red Prisma stack trace
that's been polluting every test run since the Node 24 upgrade.

### 1. View Issue: popup-shown == report-viewable

The principle is simple: if the popup is on screen, there is
already a valid pending report behind it — the earlier
`pickNearbyReport` gate and the `if (!nearby) return null` early
return in the overlay both guarantee that. Whether the catalogue
has redeemable inventory is a property of the *reward*, not of
the *report* — disabling navigation because the reward is gone
conflates the two and breaks the only escape route the user
has from the popup.

`NotificationOverlay.tsx` drops the `disabled` prop on the View
Issue button. The "No reward inventory available right now" copy
stays — it's still informative, it just no longer locks the
user in place. The yellow `+X XP challenge` label continues to
signal that there's no voucher at the end of this particular
issue.

### 2. Per-report `rewardId` linkage (`UiReport.rewardId`)

To reach the "XP challenge" branch reliably during a demo, the
old global-stock rule was inadequate — it required draining
every reward to 0, which is both unrealistic and noisy. The new
rule: a report may carry an optional `rewardId` pointing at a
single reward in the catalogue. When set, `getRewardStatusForReport`
checks *that* reward's stock alone, ignoring the rest of the
catalogue. When unset, the old global-sum behaviour applies.

Edge case: a stale `rewardId` pointing at a reward that no
longer exists falls through to the global-sum branch. This is
defensive — the popup should degrade gracefully rather than
crash if a report outlives its linked reward (e.g. catalogue
rotation, persisted state from an older shape).

### 3. Catalogue: Pizza Hut €20 Voucher replaces the Cinema clone

The last reward (`id: 5`) was previously a duplicate of `id: 4`
(same Cinema imagery, near-identical title). Replaced with a
fresh "Pizza Hut €20 Voucher" entry — distinct title, distinct
Unsplash image URL, `stock: 0`. Seed report `id: 1` (the
pending "Broken Sidewalk on Anexartisias" issue) now links to
this reward, so a user who opens the prototype in "All
Locations" with no geolocation will reliably see the XP
challenge variant on first popup.

### 4. Persist version 4: hard reset, again

Same v3 pattern, bumped to v4 so anyone still on v3 picks up
the new `rewardId` shape on reports plus the renamed reward.
The migrate logic is now factored out:

- `STORAGE_VERSION` — single source of truth for the target version.
- `freshSeedState()` — the canonical "just installed" snapshot,
  exported so tests can compare against it without re-deriving
  the seed shape.
- `migrateState(persisted, fromVersion)` — top-level function
  used by the persist config. Pure, testable, no closure capture.

### 5. Prisma CLI / Node 24 incompat: graceful skip

`npx prisma db push` (called from `makeTestDb` in `setup.ts`)
throws `SyntaxError: Undefined Unicode code-point` under Node
24, because the Prisma 6 CLI bundle relies on a `\uXXXX` escape
sequence that the stricter Node 24 CJS loader rejects. The DB
itself is fine — `@prisma/client` loads cleanly — but every
test run was emitting a thousand-line bundle dump and a failed
suite.

`api.test.ts` now probes for CLI compat at module load via
`execSync("npx prisma --version", { stdio: "ignore" })`. If it
fails, a single one-line stderr warning is printed and a
`dbDescribe = describe.skip` alias is used for every DB-backed
describe. The pure `xpFor` describe is kept as a normal
`describe` so its 2 cases continue to run regardless. The
`beforeAll`/`afterAll` short-circuit on the same flag.

Result: 60 passing, 15 cleanly skipped (was 46 passing + a
failed suite + a screen of red).

### 6. New tests in `store.test.ts`

12 new cases. Highlights:

- `getRewardStatusForReport`: per-report rewardId path
  overrides global stock; restocking the linked reward flips
  availability back; stale-rewardId fallback returns the
  global-sum number without crashing.
- `seed catalogue (v4 invariants)`: pinned-down invariants for
  the last reward entry (id, title, stock, *unique* image URL
  vs the rest of the array), and report 1's link to it. Plus
  an end-to-end-ish check that `pickNearbyReport(All Locations,
  no origin)` lands on the linked report, so
  `proximityRewardLabel` deterministically returns
  `+X XP challenge`.
- `persist migrate (v4 hard reset)`: directly exercises the
  exported `migrateState` — a stale v1 snapshot with bizarre
  values is fully overridden by the seeds, an already-current
  snapshot passes through untouched, the linked `rewardId: 5`
  on report 1 survives the migrate.

Existing "stock-exhausted" / "available when stock exists"
cases were retargeted: they now look up the *first pending
report without a rewardId* instead of hardcoding report id 1
(which is no longer unlinked). The intent of the test didn't
change — only the fixture that satisfies the "unlinked" precondition.

Test count went from 63 to 75 (60 active + 15 DB-skipped).

---

## Reward / leaderboard polish + dev guardrails + Node 22 pin

A grab bag of small things, each motivated by something the user
hit while clicking through the prototype: the Pizza Hut card
looked clickable when it wasn't, the moderation tools didn't
reach the leaderboard, the dev console silently swallowed
typos, the Nearby popup wouldn't re-open without a reload, and
the test suite was permanently 15 short on Node 24.

### 1. Out-of-stock visual overlay + consistent disabled treatment (`Rewards.tsx`)

The "Need X more XP" overlay was already doing the right thing
for affordability-gated rewards: full-card `bg-black/40`
darkening with a white-pill chip in the middle. Out-of-stock
rewards (Pizza Hut at id 5) had no such treatment — they looked
identical to in-stock cards but their Redeem button was just
quietly disabled.

The two states are now visual siblings *and* visually
distinguishable. A `disabled = outOfStock || !canAfford` flag
fades the card's content area (title, description, XP cost,
"N left", Redeem button) to `opacity-60` for both states — so a
quick glance instantly reads "unavailable right now" regardless
of which lock is active. The chip overlay is the consistent
sibling treatment.

The *differentiator* lives on the image:

- **Out of stock** is a hard, catalogue-wide lock — the user
  cannot unlock it from this surface — so the image gets a
  `grayscale` filter to read as visually inert. The card
  background also picks up `bg-gray-50` and the border stays
  gray even if the user could otherwise afford the price.
- **Affordability locked** is a soft lock — earn more XP and
  the reward opens — so the image keeps its full colour to
  preserve the incentive. Only the content area fades.

Affordability is moot when the reward isn't redeemable at all,
so the chip ternary still prefers stock messaging over XP
messaging when both are true. The Redeem button continues to be
`disabled` on `!canAfford || reward.stock === 0` (unchanged) —
the new styling is purely visual reinforcement of state the
button was already signalling.

### 2. Banned users dropped from the Leaderboard (`Leaderboard.tsx`)

Banned authors were already suppressed in the Nearby popup
(`bannedUsernames.includes(r.createdByName)`) and in the admin
moderation surface. The leaderboard was the one place a banned
spammer could still hold a podium spot and brag about their XP.

`useMemo` over `users.filter(...).sort(...)` — filter first so
ranks are computed on the surviving set. The user immediately
below a banned author actually moves up a position, which is
the desired moderation outcome (not just hiding the row but
collapsing the gap).

### 3. `cu.patchReport` guardrails (`devConsole.ts`)

Two ambiguities the demo operator could trip over silently:

- **Unknown id.** `cu.patchReport(9999, { ... })` previously
  no-op'd: the `.map` left every report untouched and persist
  wrote the same array back. Now an explicit `Error` with a
  hint to `cu.state().reports` for valid ids.
- **Unlinking a reward.** Passing `rewardId: undefined` (or
  `null`) used to set the field to `undefined`, which JSON
  drops on persist and leaves `"rewardId": null` lingering on
  some shapes. The branch now detects "`rewardId` in patch and
  patch.rewardId == null" and `delete`s the key entirely. End
  result: the report is back to truly unlinked, and the
  global-stock fallback in `getRewardStatusForReport` kicks in
  exactly as if `rewardId` had never been set.

`patchUser` and `patchReward` were left as-is on purpose —
they don't share the same "stale fk" failure mode and the
typo-on-id case is less load-bearing for either.

### 4. Nearby popup re-triggers on district re-select (`Dashboard.tsx`)

The 3-second timer's `useEffect` had an empty deps array, so
it fired exactly once at mount. If the user dismissed the
popup and then changed districts to one with pending issues,
the popup wouldn't reappear until a full page reload —
fundamentally a stale-closure bug masked by the page lifecycle.

Adding `selectedDistrict` to the deps re-arms a fresh 3-second
timer on every district change. The callback still reads
`useAppStore.getState()` synchronously rather than closing
over the dep, so an in-flight district re-selection mid-timer
is also respected. Rapid switches are naturally debounced —
the cleanup `clearTimeout` cancels the prior timer before each
new one schedules, so only the last district's timer fires.

The NotificationOverlay's internal "open && !nearby →
auto-close" effect remains as the rendering-side backstop —
nothing about that contract changed.

### 5. `.nvmrc` pin to Node 22 + lockfile reformat

A two-line file at the repo root: `22\n`. nvm reads it on
`nvm use` / `nvm install` and snaps to the latest installed
Node 22.x. No `engines` field, no postinstall hook, no
package.json change, no shell-rc touched — purely declarative,
opt-in via nvm. Running `nvm use` without Node 22 installed
prompts the user to `nvm install`; running it after install
flips the version for the current shell only.

Effect on the test suite: the Prisma 6 CLI's bundled
`\uXXXX` escape no longer trips Node 22's parser. The
auto-skip shim in `api.test.ts` (`prismaCliWorks` probe)
auto-enables the 15 DB-backed describes once the CLI launches
successfully, so no test-file change was needed.

The accompanying `package-lock.json` diff (63 deletions, no
additions, all in optional-dep entries under `node_modules/
@rollup/rollup-*`) is npm 10.9.7 — the npm bundled with Node
22 — writing the lockfile without the `"libc": ["glibc"|"musl"]`
metadata that npm under Node 24 included. No package versions
or tree shape changed; this is a one-time format harmonisation
that ships alongside the .nvmrc.

### Test suite under Node 22

Same 75 cases, no skips, no Prisma warning. The 15 DB-backed
tests that were red-then-skipped during the v3/v4 rounds are
now running every `npm test`. No test code changed — the shim
is a probe, not a fixed list.

---

## Decoupling the `"you"` alias from the data layer (round 10)

A subtle but recurring source of confusion in earlier rounds was the
seeded user at `id=7`, whose `username` field was the literal string
`"you"`. The intent was a placeholder for "the unregistered demo
operator", but the literal leaked into surfaces where it has no
meaning as an identity claim — most visibly the `/admin/database`
registry view, which listed a row captioned `you` next to rows
captioned by real usernames. An operator reading that table cannot
distinguish "this row is me" from "this row is a literal user named
'you'" without out-of-band knowledge.

The fix is a strict separation between the data layer and the
display layer.

- **Data layer.** `seedUsers[id=7].username` was renamed from
  `"you"` to `"demo_user"`, and the three `createdByName: "you"`
  occurrences in `seedReports` (ids 3, 6, 7) were updated to match.
  Email, role, XP, and the rest of the row are unchanged — the
  `id=7` slot continues to serve as the default `currentUserId`
  before any registration. Every downstream consumer that reads
  `users[]` directly (the profile surface, comment threads,
  solution lists, the admin registry table) now sees a real,
  scalable username string for that slot.

- **Display layer.** A new component `src/app/components/
  Username.tsx` is the only place in the codebase that substitutes
  `you` / `You` / `YOU` for an author string. It consults the live
  session username and applies the substitution only when the two
  strings match; otherwise the raw author string renders verbatim.
  The component takes a `variant` prop (`lowercase` | `titlecase`
  | `uppercase`) so the same transform serves headers, body copy,
  and emphasis contexts without site-by-site casing logic. It is
  *not* wired into any existing surface yet — adoption is opt-in,
  surface-by-surface, future work. The rule it enforces is
  unidirectional: list surfaces (Dashboard cards, Nearby popup,
  "Reported by …" headers) may route through it; critical
  surfaces (Profile, /admin/database, comment threads, solution
  lists) deliberately bypass it because the audit property they
  need (verifiable identity) is orthogonal to the affordance the
  alias provides (fast self-scanning).

- **`AdminDatabaseView`'s `(you)` indicator** was already a
  display-layer cue layered on top of the raw username column;
  its fallback used to read `sessionUsername ?? "you"` to
  highlight the seeded placeholder when no real session was
  registered. The fallback was updated to `sessionUsername ??
  "demo_user"` so the highlight still points at the correct row
  without the literal `"you"` appearing anywhere in the source.

### Register-time identity → users[] sync (extended in round 10)

The original minimal-fix plan for this round was to leave
`register()` alone and merely scrub the literal `"you"` from
seed data. Review surfaced a real bug behind that decision: after
registering as a non-seed username (e.g. `wreakage_fixer`), the
admin registry view rendered **two** rows for the same operator
— the seeded `"demo_user"` placeholder at `id=7` AND a
session-appended `"wreakage_fixer"` row produced by
`buildAnonymizedRegistry`'s append branch. The same split also
left `getCurrentUser()` (which reads `users[currentUserId]`) and
the identity slice's `username` field out of agreement, which
meant new reports filed by the registered citizen were still
authored as `"demo_user"` in their `createdByName` field.

The resolution is a register-time sync between the two layers,
with explicit collision handling for the seed-name case. The new
`register()` performs a second `set(...)` after the identity slice
write:

- **Non-collision (the `wreakage_fixer` case).** Overlay the slot
  at `currentUserId` (typically `id=7`) in place: `username`,
  `email`, `identityNullifierHex`, `loginNullifierHex`, and
  `role` are replaced with the registered values. Reports whose
  `createdByName` was the placeholder name are retro-fitted to
  the new username, so the citizen's "My Reports" list surfaces
  their three seeded reports as their own from the first render.
  The placeholder row is *replaced*, not appended — there is
  exactly one row per real identity in the registry view.

- **Collision (registered name matches a seed, e.g. `civic_hero`).**
  Move `currentUserId` to the matching seed row, and overlay just
  the nullifier hex columns with the real PBKDF2 outputs. The
  unrelated placeholder row at the old `currentUserId` is left
  alone. This avoids creating two rows with the same username,
  which would be the worst possible registry-view UX.

`buildAnonymizedRegistry`'s append branch is no longer reachable
through the normal flow, but its code path is kept as defensive
fallback for state-inconsistency edge cases.

### Migration policy (v7 → v8)

`STORAGE_VERSION` was bumped from 7 to 8. The new branch in
`migrateState` performs two rewrites in sequence:

1. Scrub the literal `"you"` residue from any rehydrated
   `users[]` row (username + email) and any rehydrated
   `reports[]` entry (`createdByName`). Fresh-install installs
   never need this step; existing users at v7 do.

2. If the persisted identity slice already carries a registered
   `username` (i.e. the user registered under a pre-v8 build),
   apply the same register-time sync described above
   *retroactively*. The two branches mirror `register()`'s
   collision handling exactly: adopt an existing seed slot when
   the names collide; overlay the placeholder at `currentUserId`
   otherwise. The credential triple (`username`,
   `loginNullifier`, `ownershipPublicKey`) in the identity slice
   is preserved byte-for-byte throughout — this is a data-layer
   realignment, not a credential rotation, and a returning user
   who logged in before the bump does **not** have to re-register.

Direct migrate tests in `src/__tests__/store.test.ts` pin down
the new contract on three branches: the registered-non-collision
case (id=7 is overlaid in place with the registered identity),
the no-registration case (id=7 falls back to `"demo_user"`), and
the seed-collision case (currentUserId moves to the matching id,
exactly one row per username).

Test suite: `10 passed | 193 passed` (5 new tests: 3 for the
register-time sync and 2 additional migrate variants).

### Round 10 follow-ups (amend)

Folded into the same commit, not a separate round:

- `<Username />` is now wired into `ReportDetail.tsx` for the
  "Reported by …" line (variant `lowercase`). Comments and
  solutions on the same surface deliberately stay on raw
  `authorName` / `submittedByName` — the rule (list-style
  views use the alias, audit-style views render raw) is
  enforced by code inspection.
- `cu.becomeUser(username, password?, rawCitizenId?)` added to
  the dev console. One-call shortcut that closes the four auth-
  flow gaps the older two-`cu.setState` pattern left behind (no
  PBKDF2 hex, no Ed25519 ownership key, no `isAuthenticated`,
  no `role`). **Non-destructive by default**: with no second
  argument, the call reuses stored credentials when they exist
  for the requested username (flips `isAuthenticated: true`,
  aligns `currentUserId` to the matching `users[]` slot, leaves
  the credential triple verbatim — re-login through the UI on
  the original password continues to work) or, if no credentials
  exist, logs a console warning and changes nothing. The only
  way to rewrite stored credentials is to pass an explicit
  password as the second argument; that is the documented
  consent signal for a full re-register. Typo-grade calls and
  fresh-install demos therefore cannot accidentally obliterate
  a working `wreakage_fixer` session.
  Third-argument `rawCitizenId` defaults to a deterministic
  djb2-of-username 10-digit string, so two `becomeUser` calls
  with different usernames do not silently produce the same
  identity nullifier hex (the identity derivation is a pure
  function of the citizen ID, and the previous hard-coded
  default `"1234567890"` made every assumed user share the
  same identity hex).
- Three isolated TS 5.7+ assignability errors resolved by
  casting `Uint8Array` arguments to `BufferSource` at the
  `crypto.subtle.{importKey, sign, verify}` call sites in
  `src/lib/totp.ts` and `src/lib/ownership.ts`. Pure type-level
  change, runtime unchanged. The remaining 47 `tsc --noEmit`
  errors (NearbyCandidate widening, IdentitySlice creator
  typing, Prisma `Json` typing) are pre-existing systematic
  patterns that need their own scoped cleanup.
- `src/main.tsx`'s App import dropped its explicit `.tsx`
  extension to clear `TS5097` without enabling
  `allowImportingTsExtensions` globally.
- `.gitignore` extended with root-anchored patterns for
  iteration artefacts (screenshots, draft chapter docs, backup
  archives, verification notes). The leading `/` confines each
  pattern to repo root so a legitimate same-extension file
  under `src/`, `public/`, `prisma/`, etc. is unaffected.
