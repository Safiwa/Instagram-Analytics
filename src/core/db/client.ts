import { neon } from "@neondatabase/serverless";

export type SqlRow = Record<string, unknown>;
export type SqlRunner = (text: string, params?: unknown[]) => Promise<SqlRow[]>;

// Each statement is one HTTPS request to Neon. A slow database must never hold
// up a profile page, so every query has a hard timeout.
const QUERY_TIMEOUT_MS = 5_000;

let cachedUrl: string | null = null;
let cachedRunner: SqlRunner | null = null;
let testRunner: SqlRunner | null | undefined;

function databaseUrl(): string | null {
  return process.env.DATABASE_URL?.trim() || null;
}

// The database is optional: without DATABASE_URL the site behaves exactly as
// before (no history is stored and nothing is read back).
export function isDatabaseConfigured(): boolean {
  return testRunner !== undefined ? testRunner !== null : databaseUrl() !== null;
}

export function getSql(): SqlRunner | null {
  if (testRunner !== undefined) {
    return testRunner;
  }

  const url = databaseUrl();
  if (!url) {
    return null;
  }
  if (cachedRunner && cachedUrl === url) {
    return cachedRunner;
  }

  const sql = neon(url);
  cachedUrl = url;
  cachedRunner = (text, params = []) =>
    sql.query(text, params, {
      fetchOptions: { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) },
    }) as Promise<SqlRow[]>;
  return cachedRunner;
}

// Tests inject a fake runner; pass undefined to restore the real one.
export function setSqlRunnerForTests(runner: SqlRunner | null | undefined): void {
  testRunner = runner;
}
