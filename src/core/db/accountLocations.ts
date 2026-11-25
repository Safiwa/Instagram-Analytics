import { recordableCountries, setRecordedAccountLocations } from "../analytics/country";
import { log } from "../logging/logger";
import { getSql } from "./client";

export type AccountLocation = { username: string; country: string | null; recordedAt: string };

const CACHE_TTL_MS = 10 * 60 * 1000;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

export function normalizeHandle(value: string): string | null {
  const handle = value.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

export function isRecordableCountry(country: string): boolean {
  return recordableCountries().includes(country);
}

export async function listAccountLocations(): Promise<AccountLocation[]> {
  const sql = getSql();
  if (!sql) {
    return [];
  }
  const rows = await sql(
    "select username, country, recorded_at from account_locations order by recorded_at desc",
    [],
  );
  return rows.map((row) => ({
    username: String(row.username),
    country: row.country === null || row.country === undefined ? null : String(row.country),
    recordedAt: new Date(row.recorded_at as string).toISOString(),
  }));
}

export async function saveAccountLocation(username: string, country: string | null): Promise<void> {
  const sql = getSql();
  if (!sql) {
    throw new Error("Database is not configured.");
  }
  await sql(
    `insert into account_locations (username, country, recorded_at) values ($1, $2, now())
     on conflict (username) do update set country = excluded.country, recorded_at = now()`,
    [username, country],
  );
  loadedAt = 0;
}

export async function deleteAccountLocation(username: string): Promise<void> {
  const sql = getSql();
  if (!sql) {
    return;
  }
  await sql("delete from account_locations where username = $1", [username]);
  loadedAt = 0;
}

// Loads the recorded values into the country module at most every ten minutes
// per server instance. Pages call this before ranking or labelling countries.
// A failed load keeps the previous values.
export async function ensureRecordedLocations(now = Date.now()): Promise<void> {
  if (now - loadedAt < CACHE_TTL_MS) {
    return;
  }
  inflight ??= (async () => {
    try {
      const entries = await listAccountLocations();
      setRecordedAccountLocations(new Map(entries.map((entry) => [entry.username, entry.country])));
      loadedAt = Date.now();
    } catch (error) {
      log.warn("account locations load failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      inflight = null;
    }
  })();
  await inflight;
}

export function resetRecordedLocationsForTests(): void {
  loadedAt = 0;
  inflight = null;
  setRecordedAccountLocations(new Map());
}
