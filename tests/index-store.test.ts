import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  audienceTier,
  buildTierBenchmarks,
  indexPosition,
  MIN_TIER_SAMPLE,
  quantile,
} from "../src/core/analytics/benchmark";
import { inferCountrySignal } from "../src/core/analytics/country";
import { computeMetrics } from "../src/core/analytics/metrics";
import { followerChanges, pointsInRange } from "../src/core/analytics/history";
import type { CreatorProfile, DailyPoint, Post } from "../src/core/data/types";
import { setSqlRunnerForTests } from "../src/core/db/client";
import { withStoredHistory } from "../src/core/db/enrich";
import {
  clearIndexCacheForTests,
  countIndexedProfiles,
  getIndexSample,
  listIndexCountries,
  loadIndexedProfiles,
  loadIndexSample,
  loadStoredEngagement,
  searchIndex,
} from "../src/core/db/indexStore";
import { markTracked, recordProfileSnapshot, utcDay } from "../src/core/db/snapshots";
import { parseDiscoverParams, toFilters } from "../src/features/discover/filters";

const mocks = vi.hoisted(() => ({ getTrackedProfiles: vi.fn(async () => [] as CreatorProfile[]) }));
vi.mock("../src/core/data/leaderboard", () => ({ getTrackedProfiles: mocks.getTrackedProfiles }));

const { getRegionalProfiles } = await import("../src/core/data/regional");

let db: PGlite;
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    type: "Reel",
    caption: `caption ${id}`,
    postedAt: daysAgo(2).toISOString(),
    likes: 200,
    comments: 20,
    viewCount: 5_000,
    permalink: `https://www.instagram.com/reel/${id}/`,
    hashtags: ["food"],
    ...overrides,
  };
}

function profile(username: string, followers: number, overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    username,
    displayName: `Name ${username}`,
    category: "Food blogger",
    bio: "",
    followers,
    following: 100,
    postsCount: 300,
    isVerified: false,
    source: "live",
    followerHistory: [],
    recentPosts: [post(`${username.replace(/\W/g, "")}1`), post(`${username.replace(/\W/g, "")}2`)],
    ...overrides,
  };
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
  clearIndexCacheForTests();
  mocks.getTrackedProfiles.mockReset();
  mocks.getTrackedProfiles.mockResolvedValue([]);
  setSqlRunnerForTests(async (text, params = []) => (await db.query(text, params)).rows as never);
});

describe("stored engagement fallback", () => {
  it("returns the latest snapshot that had visible posts", async () => {
    await recordProfileSnapshot(profile("zuha", 44_000), { now: daysAgo(5) });
    await recordProfileSnapshot(profile("zuha", 44_100, { recentPosts: [] }), { now: daysAgo(1) });

    const stored = await loadStoredEngagement("@Zuha");
    expect(stored?.measuredOn).toBe(utcDay(daysAgo(5)));
    expect(stored?.averageLikes).toBe(200);
    expect(stored?.averageComments).toBe(20);
    expect(stored?.engagementRatePct).toBeCloseTo(0.5, 2);
    expect(await loadStoredEngagement("unknown")).toBeNull();
  });

  it("attaches history and stored engagement only when Instagram hides the posts", async () => {
    await recordProfileSnapshot(profile("zuha", 44_000), { now: daysAgo(3) });

    const hidden = await withStoredHistory(profile("zuha", 44_200, { recentPosts: [] }));
    expect(hidden.storedEngagement?.measuredOn).toBe(utcDay(daysAgo(3)));
    expect(hidden.tracking?.points).toHaveLength(1);
    const metrics = computeMetrics(hidden);
    expect(metrics.engagementSource).toBe("stored-snapshot");
    expect(metrics.avgLikes).toBe(200);

    const visible = await withStoredHistory(profile("zuha", 44_200));
    expect(visible.storedEngagement).toBeUndefined();
    expect(computeMetrics(visible).engagementSource).toBe("public-posts");

    const demo = profile("zuha", 44_200, { source: "demo", recentPosts: [] });
    expect(await withStoredHistory(demo)).toBe(demo);
  });
});

describe("indexed profiles", () => {
  it("rebuilds profiles from the latest snapshot and stored posts", async () => {
    await recordProfileSnapshot(
      profile("raw.lebanon", 55_079, {
        isVerified: true,
        recentPosts: [
          post("LEB1", { location: "Beirut, Lebanon", hashtags: ["beirut"] }),
          post("LEB2", { likes: 0, likesHidden: true, type: "Carousel" }),
        ],
      }),
    );

    const [rebuilt] = await loadIndexedProfiles({ usernames: ["RAW.LEBANON"] });
    expect(rebuilt.username).toBe("raw.lebanon");
    expect(rebuilt.followers).toBe(55_079);
    expect(rebuilt.isVerified).toBe(true);
    expect(rebuilt.recentPosts).toHaveLength(2);
    const hidden = rebuilt.recentPosts.find((item) => item.id === "LEB2");
    expect(hidden).toMatchObject({ likes: 0, likesHidden: true, type: "Carousel" });
    expect(rebuilt.recentPosts.find((item) => item.id === "LEB1")?.location).toBe("Beirut, Lebanon");
    expect(inferCountrySignal(rebuilt).country).toBe("Lebanon");

    expect(await loadIndexedProfiles({ usernames: [] })).toEqual([]);
  });

  it("fills missing Middle East peers from the index without overriding fresh tracked data", async () => {
    await recordProfileSnapshot(profile("khalus_recipes", 47_996));
    await recordProfileSnapshot(profile("airagymn", 40_000));
    await recordProfileSnapshot(profile("not.in.region", 40_000));

    mocks.getTrackedProfiles.mockResolvedValue([profile("airagymn", 99_999)]);
    const pool = await getRegionalProfiles();
    const names = pool.map((item) => item.username).sort();

    expect(names).toEqual(["airagymn", "khalus_recipes"]);
    expect(pool.find((item) => item.username === "airagymn")?.followers).toBe(99_999);
  });
});

describe("benchmark sample and tiers", () => {
  it("uses the latest measured snapshot per profile", async () => {
    await recordProfileSnapshot(profile("one", 50_000, { recentPosts: [post("A1", { likes: 100, comments: 0 })] }), { now: daysAgo(4) });
    await recordProfileSnapshot(profile("one", 50_000, { recentPosts: [post("A1", { likes: 1_000, comments: 0 })] }));
    await recordProfileSnapshot(profile("two", 50_000, { recentPosts: [] }));

    const sample = await loadIndexSample();
    expect(sample).toHaveLength(1);
    expect(sample[0]).toMatchObject({ username: "one", followers: 50_000, engagementRate: 2 });
    expect(await getIndexSample()).toEqual(sample);
  });

  it("reports a tier only once it has enough profiles", () => {
    const micro = Array.from({ length: MIN_TIER_SAMPLE }, (_, index) => ({
      username: `m${index}`,
      followers: 20_000,
      engagementRate: index + 1,
    }));
    const tiers = buildTierBenchmarks([...micro, { followers: 5_000, engagementRate: 9 }]);
    const microTier = tiers.find((tier) => tier.tier.label === "Micro")!;
    const nanoTier = tiers.find((tier) => tier.tier.label === "Nano")!;

    expect(microTier).toMatchObject({ ready: true, sampleSize: 8, median: 4.5, p25: 2.75, p75: 6.25 });
    expect(nanoTier).toMatchObject({ ready: false, sampleSize: 1, median: null });
    expect(audienceTier(999)).toBeNull();
    expect(audienceTier(1_000_000)?.label).toBe("Mega");
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("places a profile within its tier, excluding itself", () => {
    const sample = Array.from({ length: 10 }, (_, index) => ({
      username: `p${index}`,
      followers: 20_000,
      engagementRate: index + 1,
    }));
    const position = indexPosition("P9", 20_000, 7.5, sample);
    // p9 (rate 10) is the profile itself and is excluded: 7 of 9 peers are lower.
    expect(position).toMatchObject({ sampleSize: 9, percentile: 78, median: 5 });
    expect(indexPosition("x", 20_000, 3, sample.slice(0, MIN_TIER_SAMPLE - 1))).toBeNull();
    expect(indexPosition("x", 500, 3, sample)).toBeNull();
  });
});

describe("discover search", () => {
  beforeEach(async () => {
    await recordProfileSnapshot(profile("dubai.eats", 20_000, { accountCountry: "United Arab Emirates", category: "Food blogger" }));
    await recordProfileSnapshot(profile("beirut.style", 300_000, { accountCountry: "Lebanon", category: "Fashion", recentPosts: [post("B1", { likes: 9_000 })] }));
    await recordProfileSnapshot(profile("hidden.acc", 50_000, { isPrivate: true, accountCountry: "Lebanon", recentPosts: [] }));
    await recordProfileSnapshot(profile("old.one", 50_000), { now: daysAgo(45) });
  });

  it("filters by text, country and size, excluding private and stale profiles", async () => {
    expect((await searchIndex({})).map((row) => row.username)).toEqual(["beirut.style", "dubai.eats"]);
    expect((await searchIndex({ query: "food" })).map((row) => row.username)).toEqual(["dubai.eats"]);
    expect((await searchIndex({ query: "@BEIRUT" })).map((row) => row.username)).toEqual(["beirut.style"]);
    expect(await searchIndex({ query: "100%" })).toEqual([]);
    expect((await searchIndex({ country: "Lebanon" })).map((row) => row.username)).toEqual(["beirut.style"]);
    expect((await searchIndex({ minFollowers: 10_000, maxFollowers: 100_000 })).map((row) => row.username)).toEqual(["dubai.eats"]);
  });

  it("sorts by engagement and returns measured values", async () => {
    const [top, second] = await searchIndex({ sort: "engagement" });
    // (9,000 + 20) / 300,000 = 3.01% beats (200 + 20) / 20,000 = 1.1%.
    expect(top.username).toBe("beirut.style");
    expect(top.engagementRate).toBeCloseTo(3.01, 2);
    expect(second.engagementRate).toBeCloseTo(1.1, 2);
    expect(top.capturedOn).toBe(utcDay(new Date()));
  });

  it("lists countries with counts and the index size", async () => {
    expect(await listIndexCountries()).toEqual([
      { country: "Lebanon", profiles: 2 },
      { country: "United Arab Emirates", profiles: 1 },
    ]);
    expect(await countIndexedProfiles()).toBe(3);
  });

  it("validates URL parameters before they reach the database", () => {
    const params = parseDiscoverParams({ q: ["  beauty "], size: "huge", sort: "drop table", country: "Lebanon" });
    expect(params).toEqual({ q: "beauty", country: "Lebanon", size: "", sort: "followers" });
    expect(toFilters({ ...params, size: "micro" })).toMatchObject({ minFollowers: 10_000, maxFollowers: 100_000 });
  });
});

describe("index readers fail soft", () => {
  it("return empty results when the database errors or is missing", async () => {
    setSqlRunnerForTests(async () => {
      throw new Error("down");
    });
    expect(await searchIndex({})).toEqual([]);
    expect(await loadIndexedProfiles()).toEqual([]);
    expect(await countIndexedProfiles()).toBeNull();

    setSqlRunnerForTests(null);
    expect(await loadStoredEngagement("x")).toBeNull();
    expect(await loadIndexSample()).toEqual([]);
    await markTracked(["x"]);
  });
});

describe("follower change windows", () => {
  it("measures each window from the latest snapshot old enough", () => {
    const now = new Date("2026-12-31T12:00:00Z");
    const points: DailyPoint[] = [
      { date: "2026-10-01", followers: 900, engagementRate: null },
      { date: "2026-12-01", followers: 950, engagementRate: 1 },
      { date: "2026-12-24", followers: 990, engagementRate: 1 },
      { date: "2026-12-30", followers: 995, engagementRate: 1 },
    ];
    const changes = followerChanges(points, 1_000, now);
    expect(changes.map((change) => change.baselineDate)).toEqual([
      "2026-12-30",
      "2026-12-24",
      "2026-12-01",
      "2026-10-01",
    ]);
    expect(changes[2]).toMatchObject({ followers: 50, pct: 5.26 });
    expect(followerChanges(points.slice(3), 1_000, now)[1].pct).toBeNull();
    expect(pointsInRange(points, 30, now).map((point) => point.date)).toEqual([
      "2026-12-01",
      "2026-12-24",
      "2026-12-30",
    ]);
  });
});
