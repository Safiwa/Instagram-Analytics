import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPostPerformance } from "../src/core/analytics/postPerformance";
import { fetchPostHistory, type HistoryPost } from "../src/core/data/postHistory";
import { setSqlRunnerForTests } from "../src/core/db/client";
import { getPostHistory } from "../src/core/db/postHistory";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const DAY = 86_400_000;

function post(daysAgo: number, likes: number | null, comments: number, views: number | null = null): HistoryPost {
  return {
    postedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    type: views === null ? "Photo" : "Reel",
    likes,
    comments,
    views,
  };
}

describe("post performance", () => {
  const history = [post(2, 100, 10, 5_000), post(10, 200, 20), post(60, 300, 30, 9_000), post(200, 50, 5)];

  it("summarises only posts inside the range, by week up to 90 days", () => {
    const ninety = buildPostPerformance(history, 90, 10_000, NOW);
    expect(ninety.bucket).toBe("week");
    expect(ninety.posts).toBe(3);
    expect(ninety.avgLikes).toBe(200);
    expect(ninety.avgComments).toBe(20);
    expect(ninety.avgViews).toBe(7_000);
    expect(ninety.engagementRate).toBe(2.2);
    expect(ninety.buckets.reduce((sum, bucket) => sum + bucket.posts, 0)).toBe(3);
  });

  it("groups a year by month and keeps hidden likes out of the like average", () => {
    const year = buildPostPerformance([...history, post(5, null, 40)], 365, 10_000, NOW);
    expect(year.bucket).toBe("month");
    expect(year.posts).toBe(5);
    expect(year.avgLikes).toBe(162.5);
    expect(year.buckets.length).toBeGreaterThanOrEqual(12);
  });
});

describe("fetchPostHistory", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("pages back until a year is covered and drops older posts", async () => {
    vi.stubEnv("IG_ACCESS_TOKEN", "token");
    vi.stubEnv("IG_BUSINESS_ACCOUNT_ID", "123");
    const media = (daysAgo: number) => ({
      timestamp: new Date(NOW - daysAgo * DAY).toISOString(),
      media_type: "IMAGE",
      like_count: 10,
      comments_count: 1,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          business_discovery: { media: { data: [media(1), media(100)], paging: { cursors: { after: "c1" } } } },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          business_discovery: { media: { data: [media(300), media(400)], paging: { cursors: { after: "c2" } } } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const posts = await fetchPostHistory("someone", { now: NOW });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(fetchMock.mock.calls[1][0]))).toContain("media.after(c1).limit(50)");
    expect(posts).toHaveLength(3);
  });

  it("returns null when Instagram refuses the first page", async () => {
    vi.stubEnv("IG_ACCESS_TOKEN", "token");
    vi.stubEnv("IG_BUSINESS_ACCOUNT_ID", "123");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: 100 } }, { status: 400 })));
    expect(await fetchPostHistory("personal.account", { now: NOW })).toBeNull();
  });
});

describe("stored post history", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(await readFile("db/migrations/0007_post_history.sql", "utf8"));
  });
  afterAll(async () => {
    setSqlRunnerForTests(undefined);
    await db.close();
  });
  beforeEach(async () => {
    await db.exec("delete from post_history");
    setSqlRunnerForTests(async (text, params = []) => (await db.query(text, params)).rows as never);
  });

  it("reads Instagram at most once a day and serves the stored copy in between", async () => {
    const fetcher = vi.fn().mockResolvedValue([post(1, 10, 1)]);
    const first = await getPostHistory("Someone", { fetcher, now: NOW });
    const second = await getPostHistory("someone", { fetcher, now: NOW + 60_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second?.posts).toEqual(first?.posts);

    await getPostHistory("someone", { fetcher, now: NOW + 2 * DAY });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back to the stored copy when a refresh is refused", async () => {
    await getPostHistory("someone", { fetcher: vi.fn().mockResolvedValue([post(1, 10, 1)]), now: NOW });
    const refused = await getPostHistory("someone", { fetcher: vi.fn().mockResolvedValue(null), now: NOW + 2 * DAY });
    expect(refused?.posts).toHaveLength(1);
  });
});
