# CrowdUpKeep Prototype

Thesis MVP for a civic-issue reporting + gamified resolution app, scoped to
Limassol, Cyprus. Citizens map issues, neighbours propose fixes,
moderators accept solutions, solvers earn XP, and XP redeems for vouchers.

## Stack

- **Vite + React 18** — UI shell.
- **Zustand** — in-memory app state for the UI.
- **Prisma + SQLite** — persistent layer used by the seed and tests.
- **Vitest** — test runner (CRUD, geo, XP trigger).
- **Leaflet / react-leaflet** — map.

## Setup

```bash
npm install
npx prisma db push     # create the SQLite schema
npx prisma db seed     # populate Limassol demo data
npm run dev            # Vite dev server
```

## Tests

```bash
npm test               # full suite
npm run test:watch     # watch mode
```

See [`IMPLEMENTATION_LOG.md`](./IMPLEMENTATION_LOG.md) for the running
record of design decisions and trade-offs.
