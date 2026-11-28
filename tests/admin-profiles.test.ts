import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminReturnPath } from "../src/core/admin/auth";
import { setSqlRunnerForTests } from "../src/core/db/client";
import { listConnectedProfilesForAdmin } from "../src/core/db/connected";

let db: PGlite;

async function connect(
  username: string,
  connectedAt: string,
  lastSyncedAt: string | null = null,
): Promise<void> {
  await db.query(
    `insert into connected_accounts
       (ig_user_id, username, account_type, access_token_enc, token_expires_at, connected_at, last_synced_at)
     values ($1, $2, 'CREATOR', 'sealed-for-admin-test', '2100-01-01T00:00:00Z', $3, $4)`,
    [`ig-${username}`, username, connectedAt, lastSyncedAt],
  );
}

async function location(username: string, country: string | null): Promise<void> {
  await db.query("insert into account_locations (username, country) values ($1, $2)", [
    username,
    country,
  ]);
}

beforeAll(async () => {
  db = new PGlite();
  for (const file of ["0002_connected_accounts.sql", "0006_account_locations.sql"]) {
    await db.exec(await readFile(`db/migrations/${file}`, "utf8"));
  }
});

afterAll(async () => {
  setSqlRunnerForTests(undefined);
  await db.close();
});

beforeEach(async () => {
  await db.exec("delete from connected_accounts; delete from account_locations");
  setSqlRunnerForTests(async (text, params = []) => (await db.query(text, params)).rows as never);
});

afterEach(() => {
  setSqlRunnerForTests(undefined);
});

describe("admin connected profiles", () => {
  it("lists every opt-in and counts only recorded account countries", async () => {
    await connect("uae.creator", "2026-11-20T10:00:00Z", "2026-11-27T10:00:00Z");
    await connect("egypt.creator", "2026-11-19T10:00:00Z");
    await connect("hidden.creator", "2026-11-18T10:00:00Z");
    await connect("unknown.creator", "2026-11-17T10:00:00Z");
    await location("uae.creator", "United Arab Emirates");
    await location("egypt.creator", "Egypt");
    await location("hidden.creator", null);

    const summary = await listConnectedProfilesForAdmin();

    expect(summary.total).toBe(4);
    expect(summary.countries).toEqual(
      expect.arrayContaining([
        { country: "United Arab Emirates", count: 1 },
        { country: "Egypt", count: 1 },
        { country: "Not published", count: 1 },
        { country: "Not recorded", count: 1 },
      ]),
    );
    expect(summary.countries).toHaveLength(4);
    expect(summary.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          username: "uae.creator",
          country: "United Arab Emirates",
          countryStatus: "recorded",
          lastSyncedAt: "2026-11-27T10:00:00.000Z",
        }),
        expect.objectContaining({ username: "egypt.creator", countryStatus: "recorded" }),
        expect.objectContaining({ username: "hidden.creator", countryStatus: "not-published" }),
        expect.objectContaining({ username: "unknown.creator", countryStatus: "not-recorded" }),
      ]),
    );
    expect(summary.profiles).toHaveLength(4);
    expect(summary.profiles[0].username).toBe("uae.creator");
  });

  it("returns an empty summary when the database is unavailable", async () => {
    setSqlRunnerForTests(undefined);
    await expect(listConnectedProfilesForAdmin()).resolves.toEqual({
      total: 0,
      countries: [],
      profiles: [],
    });
  });
});

describe("admin return paths", () => {
  it("allows only the two admin pages and keeps the default otherwise", () => {
    expect(adminReturnPath("/admin/profiles")).toBe("/admin/profiles");
    expect(adminReturnPath("/admin/locations")).toBe("/admin/locations");
    expect(adminReturnPath("https://evil.example/admin/profiles")).toBe("/admin/locations");
    expect(adminReturnPath("/profile/alaaabuharb")).toBe("/admin/locations");
    expect(adminReturnPath(undefined)).toBe("/admin/locations");
  });
});
