import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// Each test run gets its own SQLite file so a Vitest crash can't corrupt the
// dev DB or another suite. The file is removed in the teardown helper.
export interface TestDb {
  client: PrismaClient;
  dbPath: string;
  cleanup: () => Promise<void>;
}

export async function makeTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(path.join(tmpdir(), "cuk-test-"));
  const dbPath = path.join(dir, "test.db");
  const url = `file:${dbPath}`;

  // db push creates the schema in the freshly minted file. We pass the URL
  // explicitly so this never touches the developer's dev.db.
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });

  const client = new PrismaClient({ datasources: { db: { url } } });

  const cleanup = async () => {
    await client.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  };

  return { client, dbPath, cleanup };
}
