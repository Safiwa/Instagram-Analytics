import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminCookieValue,
  isAdminConfigured,
  isAdminSession,
  isSameOrigin,
  passwordMatches,
} from "../src/core/admin/auth";
import { inferCountrySignal, recordableCountries } from "../src/core/analytics/country";
import type { CreatorProfile } from "../src/core/data/types";
import {
  deleteAccountLocation,
  ensureRecordedLocations,
  listAccountLocations,
  normalizeHandle,
  resetRecordedLocationsForTests,
  saveAccountLocation,
} from "../src/core/db/accountLocations";
import { setSqlRunnerForTests } from "../src/core/db/client";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("db/migrations/0006_account_locations.sql", "utf8"));
});

afterAll(async () => {
  setSqlRunnerForTests(undefined);
  await db.close();
});

beforeEach(async () => {
  await db.exec("delete from account_locations");
  setSqlRunnerForTests(async (text, params = []) => (await db.query(text, params)).rows as never);
  resetRecordedLocationsForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetRecordedLocationsForTests();
});

function creator(username: string, bio: string): CreatorProfile {
  return {
    username,
    displayName: username,
    category: "Instagram creator",
    bio,
    followers: 50_000,
    following: 100,
    postsCount: 10,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [],
  };
}

describe("recorded Account based in values", () => {
  it("override every inferred signal once loaded, and removal restores inference", async () => {
    const profile = creator("some.creator", "Living in Cairo 🇪🇬");
    expect(inferCountrySignal(profile).country).toBe("Egypt");

    await saveAccountLocation("some.creator", "United Arab Emirates");
    await ensureRecordedLocations();
    expect(inferCountrySignal(profile)).toMatchObject({ country: "United Arab Emirates", basis: "account" });

    await saveAccountLocation("some.creator", null);
    await ensureRecordedLocations();
    expect(inferCountrySignal(profile).country).toBeNull();

    await deleteAccountLocation("some.creator");
    await ensureRecordedLocations();
    expect(inferCountrySignal(profile).country).toBe("Egypt");
    expect(await listAccountLocations()).toEqual([]);
  });

  it("normalizes handles and offers only known countries", () => {
    expect(normalizeHandle(" @Najet.DH ")).toBe("najet.dh");
    expect(normalizeHandle("bad handle!")).toBeNull();
    expect(recordableCountries()).toContain("United Arab Emirates");
    expect(recordableCountries()).toContain("Syria");
  });
});

describe("admin auth", () => {
  it("is off without a strong ADMIN_PASSWORD", () => {
    vi.stubEnv("ADMIN_PASSWORD", "short");
    vi.stubEnv("CONNECT_SECRET", "x".repeat(40));
    expect(isAdminConfigured()).toBe(false);
    expect(passwordMatches("short")).toBe(false);
  });

  it("accepts only the right password and a signed admin cookie", () => {
    vi.stubEnv("ADMIN_PASSWORD", "correct-horse-battery");
    vi.stubEnv("CONNECT_SECRET", "x".repeat(40));
    expect(isAdminConfigured()).toBe(true);
    expect(passwordMatches("correct-horse-battery")).toBe(true);
    expect(passwordMatches("wrong-password-here")).toBe(false);
    expect(isAdminSession(adminCookieValue())).toBe(true);
    expect(isAdminSession("admin.9999999999999.forged")).toBe(false);
    expect(isAdminSession(undefined)).toBe(false);
  });

  it("requires same-origin form posts", () => {
    const url = "https://www.instagram-analytics.com/api/admin/locations";
    expect(isSameOrigin(new Request(url, { headers: { origin: "https://www.instagram-analytics.com" } }))).toBe(true);
    expect(isSameOrigin(new Request(url, { headers: { origin: "https://evil.example" } }))).toBe(false);
    expect(isSameOrigin(new Request(url))).toBe(false);
  });
});
