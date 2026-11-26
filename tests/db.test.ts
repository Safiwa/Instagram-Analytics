import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { analyzeGrowth } from "../src/core/analytics/growth";
import { measuredMonthChange } from "../src/core/analytics/history";
import type { ProfileResolution } from "../src/core/data/adapter";
import type { CreatorProfile, Post } from "../src/core/data/types";
import { isDatabaseConfigured, setSqlRunnerForTests } from "../src/core/db/client";
import { runCollector } from "../src/core/db/collector";
import {
  listDueHandles,
  loadTrackingHistory,
  markTracked,
  postKey,
  recordProfileSnapshot,
  snapshotValues,
  utcDay,
} from "../src/core/db/snapshots";

// Real Postgres (PGlite, in-process) running the real migration, so the SQL in
// src/core/db is checked against an actual database engine, not a mock.
let db: PGlite;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    type: "Reel",
    caption: `caption ${id}`,
    postedAt: daysAgo(3).toISOString(),
    likes: 100,
    comments: 10,
    viewCount: 1000,
    permalink: `https://www.instagram.com/reel/${id}/`,
    hashtags: ["dubai", "food"],
    ...overrides,
  };
}

function profile(overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    username: "khalus_recipes",
    displayName: "Khalid C",
    category: "Instagram creator",
    bio: "Easiest recipes",
    followers: 48_000,
    following: 298,
    postsCount: 449,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post("AAA111"), post("BBB222", { likes: 300, comments: 30 })],
    ...overrides,
  };
}

async function count(table: string): Promise<number> {
  const result = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`);
  return result.rows[0].n;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await readFile("db/migrations/0001_profile_snapshots.sql", "utf8"));
  await db.exec(await readFile("db/migrations/0005_profile_bio_and_id.sql", "utf8"));
});

afterAll(async () => {
  setSqlRunnerForTests(undefined);
  await db.close();
});

beforeEach(async () => {
  await db.exec("truncate profiles cascade");
  setSqlRunnerForTests(async (text, params = []) => (await db.query(text, params)).rows as never);
});

describe("snapshot storage", () => {
  it("stores profile, daily snapshot, posts and post snapshots", async () => {
    expect(await recordProfileSnapshot(profile(), { lookup: true })).toBe(true);

    expect(await count("profiles")).toBe(1);
    expect(await count("profile_snapshots")).toBe(1);
    expect(await count("posts")).toBe(2);
    expect(await count("post_snapshots")).toBe(2);

    const stored = await db.query<{ hashtags: string[]; lookup_count: number }>(
      "select hashtags, lookup_count from posts join profiles on profiles.id = posts.profile_id where posts.instagram_id = 'AAA111'",
    );
    expect(stored.rows[0].hashtags).toEqual(["dubai", "food"]);
    expect(stored.rows[0].lookup_count).toBe(1);
  });

  it("keeps one snapshot per day and updates it with the latest values", async () => {
    await recordProfileSnapshot(profile({ followers: 48_000 }), { lookup: true });
    await recordProfileSnapshot(profile({ followers: 48_100 }), { lookup: true });

    expect(await count("profile_snapshots")).toBe(1);
    expect(await count("post_snapshots")).toBe(2);
    const row = await db.query<{ followers: string; lookup_count: number }>(
      "select s.followers::text, p.lookup_count from profile_snapshots s join profiles p on p.id = s.profile_id",
    );
    expect(row.rows[0]).toEqual({ followers: "48100", lookup_count: 2 });
  });

  it("merges the same post from the official API and the public reader by shortcode", async () => {
    await recordProfileSnapshot(
      profile({ recentPosts: [post("17890000000000001", { permalink: "https://www.instagram.com/reel/SHORT1/" })] }),
    );
    await recordProfileSnapshot(
      profile({ source: "public", recentPosts: [post("SHORT1", { permalink: "https://www.instagram.com/p/SHORT1/" })] }),
    );
    expect(await count("posts")).toBe(1);
    expect(postKey(post("x", { permalink: "https://www.instagram.com/natgeo/p/ABC_-9/" }))).toBe("ABC_-9");
    expect(postKey(post("raw-id", { permalink: undefined }))).toBe("raw-id");
  });

  it("stores hidden like counts as null, not zero", async () => {
    await recordProfileSnapshot(profile({ recentPosts: [post("HID1", { likes: 0, likesHidden: true })] }));
    const row = await db.query<{ likes: number | null }>("select likes from post_snapshots");
    expect(row.rows[0].likes).toBeNull();
  });

  it("never writes a stored-engagement fallback back as a new measurement", async () => {
    const noPosts = profile({
      recentPosts: [],
      storedEngagement: {
        measuredOn: "2026-11-01",
        engagementRatePct: 1.2,
        averageLikes: 47,
        averageComments: 22,
      },
    });
    expect(snapshotValues(noPosts).engagementRate).toBeNull();
    await recordProfileSnapshot(noPosts);
    const row = await db.query<{ engagement_rate: string | null; avg_likes: string | null }>(
      "select engagement_rate, avg_likes from profile_snapshots",
    );
    expect(row.rows[0]).toEqual({ engagement_rate: null, avg_likes: null });
  });

  it("never stores demo fixtures and is a no-op without a database", async () => {
    expect(await recordProfileSnapshot(profile({ source: "demo" }))).toBe(false);
    expect(await count("profiles")).toBe(0);

    setSqlRunnerForTests(null);
    expect(isDatabaseConfigured()).toBe(false);
    expect(await recordProfileSnapshot(profile())).toBe(false);
    expect(await loadTrackingHistory("khalus_recipes")).toBeNull();
  });

  it("returns false instead of throwing when the database fails", async () => {
    setSqlRunnerForTests(async () => {
      throw new Error("connection reset");
    });
    await expect(recordProfileSnapshot(profile())).resolves.toBe(false);
    await expect(loadTrackingHistory("khalus_recipes")).resolves.toBeNull();
  });
});

describe("tracking history", () => {
  it("reads daily points in date order with the first snapshot day", async () => {
    await recordProfileSnapshot(profile({ followers: 47_000 }), { now: daysAgo(31) });
    await recordProfileSnapshot(profile({ followers: 47_500 }), { now: daysAgo(10) });
    await recordProfileSnapshot(profile({ followers: 48_000, recentPosts: [] }), { now: daysAgo(0) });

    const history = await loadTrackingHistory("@Khalus_Recipes");
    expect(history?.since).toBe(utcDay(daysAgo(31)));
    expect(history?.points.map((point) => point.followers)).toEqual([47_000, 47_500, 48_000]);
    expect(typeof history?.points[0].engagementRate).toBe("number");
    expect(history?.points[2].engagementRate).toBeNull();
  });

  it("turns a 30-45 day old snapshot into a measured 30-day change", async () => {
    await recordProfileSnapshot(profile({ followers: 40_000 }), { now: daysAgo(32) });
    const tracking = await loadTrackingHistory("khalus_recipes");
    const current = profile({ followers: 44_000, tracking: tracking ?? undefined });

    expect(measuredMonthChange(current)).toMatchObject({ followers: 4_000, pct: 10, days: 32 });
    const growth = analyzeGrowth(current);
    expect(growth.monthGrowthPct).toBe(10);
    expect(growth.monthGrowthFollowers).toBe(4_000);
    expect(growth.growthEstimated).toBe(false);
    expect(growth.measuredFromSnapshots).toBe(true);
    expect(growth.basis).toContain("measured against this site's stored snapshot");
  });

  it("keeps the disclosed estimate until a 30-day-old snapshot exists", async () => {
    await recordProfileSnapshot(profile({ followers: 47_900 }), { now: daysAgo(5) });
    const tracking = await loadTrackingHistory("khalus_recipes");
    const current = profile({ tracking: tracking ?? undefined });

    expect(measuredMonthChange(current)).toBeNull();
    expect(analyzeGrowth(current).measuredFromSnapshots).toBe(false);
    // Snapshots older than 45 days are not used as a 30-day baseline either.
    expect(
      measuredMonthChange(
        profile({ tracking: { since: "2026-01-01", points: [{ date: utcDay(daysAgo(60)), followers: 1, engagementRate: null }] } }),
      ),
    ).toBeNull();
  });
});

describe("daily collector", () => {
  it("lists tracked and recently searched handles, skipping ones stored today", async () => {
    await markTracked(["NatGeo", "@emirates", "not a handle!"]);
    await recordProfileSnapshot(profile(), { lookup: true });
    await recordProfileSnapshot(profile({ username: "old.search" }), { lookup: true, now: daysAgo(40) });

    const due = await listDueHandles(10);
    expect(due.sort()).toEqual(["emirates", "natgeo"]);
  });

  it("refreshes due profiles and defers what does not fit the time budget", async () => {
    await markTracked(["one", "two", "three"]);
    let clock = 0;
    const resolved: string[] = [];
    const resolve = async (handle: string): Promise<ProfileResolution> => {
      resolved.push(handle);
      clock += 1_000;
      return handle === "two"
        ? { status: "not_found", message: "missing" }
        : { status: "found", profile: profile({ username: handle }) };
    };

    const first = await runCollector({
      trackedHandles: [],
      resolve,
      concurrency: 1,
      budgetMs: 1_500,
      now: () => clock,
    });
    expect(first).toEqual({ due: 3, stored: 1, failed: 1, deferred: 1 });

    const second = await runCollector({ trackedHandles: [], resolve, concurrency: 2 });
    // Stored today: skipped. The failed and the deferred handle are retried.
    expect(second.due).toBe(2);
    expect(second.stored).toBe(1);
    expect(await count("profile_snapshots")).toBe(2);
  });
});
